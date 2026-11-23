import Fastify, { type FastifyBaseLogger } from "fastify";
import fastifyStatic from "@fastify/static";
import pino from "pino";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadConfig } from "./config/env.js";
import { resolveSettings } from "./config/resolve.js";
import { createPool } from "./store/db.js";
import { runMigrations } from "./store/migrate.js";
import { AccountRepo } from "./store/accountRepo.js";
import { MappingRepo } from "./store/mappingRepo.js";
import { ConversationRepo } from "./store/conversationRepo.js";
import { JobQueueRepo, Job } from "./store/jobQueueRepo.js";
import { SettingsRepo } from "./store/settingsRepo.js";
import { AdminUserRepo } from "./store/adminUserRepo.js";
import { LogsRepo } from "./store/logsRepo.js";
import { DbLogStream } from "./logging/dbLogStream.js";
import { loadAlertConfig, buildNotifiers } from "./alerting/config.js";
import { AlertDispatcher } from "./alerting/dispatcher.js";
import { AlertStream } from "./alerting/alertStream.js";
import { ChatwootClient } from "./chatwoot/client.js";
import { makeAppClientFor } from "./chatwoot/appClientFactory.js";
import { ChatwootAdminClient } from "./chatwoot/adminClient.js";
import { registerWebhookRoute, OutgoingEvent } from "./chatwoot/webhookServer.js";
import { registerAdminRoutes, registerAccountDeleteRoute } from "./admin/routes.js";
import { registerAuthRoutes, makeRequireSession } from "./admin/authRoutes.js";
import { registerSettingsRoutes } from "./admin/settingsRoutes.js";
import { registerLogsRoutes } from "./admin/logsRoutes.js";
import { buildWebhookUrls, registerWebhookInfoRoutes } from "./admin/webhookInfoRoutes.js";
import { deriveSessionSecret } from "./admin/auth.js";
import { SessionManager } from "./zalo/sessionManager.js";
import { ReconnectSupervisor, isZaloAuthError } from "./zalo/reconnectSupervisor.js";
import { ZcaAdapter } from "./zalo/zcaAdapter.js";
import { ZcaQrLoginService } from "./zalo/qrLoginService.js";
import { ProxyRepo } from "./store/proxyRepo.js";
import { buildProxyOptions, type ProxyOptions } from "./zalo/proxyOptions.js";
import { registerProxyRoutes } from "./admin/proxyRoutes.js";
import { InboundHandler } from "./handlers/inbound.js";
import { OutboundHandler } from "./handlers/outbound.js";
import { makeOutboundNotifier } from "./handlers/outboundNotify.js";
import { deadLetterNote, windowNote } from "./handlers/outboundNotes.js";
import { ReactionHandler, UndoHandler } from "./handlers/events.js";
import { makeEnricher } from "./handlers/enrichment.js";
import { Worker } from "./worker/worker.js";
import { decryptCredentials, encryptCredentials } from "./crypto/credentials.js";
import { IncomingMessage, ReactionEvent, UndoEvent } from "./zalo/types.js";
import { LocalDiskArchive } from "./media/archive.js";
import { registerMediaRoute } from "./media/mediaRoute.js";
import { ExtensionRegistry, type ExtensionContext } from "./extension/registry.js";
import { loadPro } from "./extension/loadPro.js";
import { OaTokenRepo } from "./store/oaTokenRepo.js";
import { OaOAuthClient } from "./zalo-oa/oauthClient.js";
import { OaSender } from "./zalo-oa/sender.js";
import { registerOaWebhookRoute } from "./zalo-oa/webhookRoute.js";
import { registerOaOAuthRoutes } from "./zalo-oa/oauthRoute.js";
import { startOaTokenRefresher } from "./zalo-oa/tokenRefresher.js";
import { fetchOaId, accessTokenProvider, fetchUserProfile } from "./zalo-oa/oaRuntime.js";
import { ConsultationTracker } from "./zalo-oa/consultationTracker.js";
import { InfoCardRepo } from "./store/infoCardRepo.js";
import { InfoRequestTracker } from "./zalo-oa/infoRequestTracker.js";
import { sendRequestUserInfo } from "./zalo-oa/requestInfoSender.js";
import { parseSharedInfo } from "./zalo-oa/sharedInfo.js";
import { applyContactInfo } from "./handlers/contactInfoSink.js";
import { registerInfoCardRoutes } from "./admin/infoCardRoutes.js";
import { encodeSourceId, decodeSourceId, ThreadKind } from "./routing/sourceId.js";
import { listRecentChat, getConversationMessages, getRecentConversationMessages } from "./zalo-oa/historyClient.js";
import { runBackfill, DEFAULT_CAPS, HistoryClient } from "./zalo-oa/oaBackfill.js";

const here = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const envCfg = loadConfig();
  await runMigrations(envCfg.databaseUrl);

  const pool = createPool(envCfg.databaseUrl);
  const logsRepo = new LogsRepo(pool);
  const settingsRepo = new SettingsRepo(pool, envCfg.credentialsKey);
  const alertConfig = await loadAlertConfig(settingsRepo);
  const alertDispatcher = new AlertDispatcher(buildNotifiers(alertConfig), {
    cooldownMs: alertConfig.cooldownMs,
    reconnectingThresholdMs: alertConfig.reconnectingThresholdMs,
  });
  const alertStream = new AlertStream(alertDispatcher);
  const dbLogStream = new DbLogStream({
    insert: (rows) => logsRepo.insertMany(rows),
    prune: (keep) => logsRepo.prune(keep),
  });
  const logger = pino(
    { level: "info" },
    pino.multistream([{ stream: process.stdout }, { stream: dbLogStream }, { stream: alertStream }]),
  );
  const app = Fastify({ loggerInstance: logger as unknown as FastifyBaseLogger });
  const cfg = await resolveSettings(settingsRepo, envCfg, app.log);

  const extensions = new ExtensionRegistry();
  await loadPro(extensions, undefined, app.log);
  const extCtx: ExtensionContext = {
    mediaArchiveRoot: cfg.mediaArchiveRoot,
    publicBaseUrl: cfg.publicBaseUrl,
    credentialsKey: cfg.credentialsKey,
    mediaTokenTtlDays: cfg.mediaTokenTtlDays,
  };

  const sessionSecret = deriveSessionSecret(envCfg.credentialsKey);
  const adminUsers = new AdminUserRepo(pool);
  const guard = makeRequireSession(sessionSecret);

  const adminAuth = extensions.adminAuth?.({ pool, sessionSecret });
  if (adminAuth) await adminAuth.ensureSchema();
  // can(key): dưới Pro = requirePermission(key); dưới Free = guard (single-admin toàn quyền).
  const can = (key: string) => (adminAuth ? adminAuth.requirePermission(key) : guard);

  const accounts = new AccountRepo(pool);
  const mapping = new MappingRepo(pool);
  const proxyRepo = new ProxyRepo(pool, cfg.credentialsKey);
  const conversations = new ConversationRepo(pool);
  const jobs = new JobQueueRepo(pool);
  const chatwoot = new ChatwootClient(cfg.chatwootBaseUrl);
  const appClientFor = makeAppClientFor(cfg.chatwootBaseUrl, cfg.chatwootApiAccessToken, cfg.chatwootAccountId, accounts);
  const archive = extensions.mediaArchive
    ? extensions.mediaArchive(extCtx)
    : new LocalDiskArchive(cfg.mediaArchiveRoot, cfg.publicBaseUrl, cfg.credentialsKey, cfg.mediaTokenTtlDays);
  const webhookUrls = buildWebhookUrls({
    chatwootWebhookBase: cfg.chatwootWebhookBase,
    webhookSecret: cfg.webhookSecret,
    publicBaseUrl: cfg.publicBaseUrl,
  });
  const chatwootAdmin = new ChatwootAdminClient(cfg.chatwootBaseUrl, cfg.chatwootApiAccessToken);

  // inbox_id -> identifier index, refreshed from DB
  const inboxIndex = new Map<number, string>();
  async function refreshIndex(): Promise<void> {
    const nextIndex = new Map<number, string>();
    for (const a of await accounts.listAll()) {
      if (a.chatwootInboxId) nextIndex.set(a.chatwootInboxId, a.chatwootInboxIdentifier);
    }
    inboxIndex.clear();
    for (const [inboxId, identifier] of nextIndex) inboxIndex.set(inboxId, identifier);
  }

  const sessions = new SessionManager();

  const infoCard = new InfoCardRepo(pool);
  // OA infra (tokens/oauth) only exists inside the `if (cfg.oa)` block below, so the
  // tracker is bound late via this ref — same pattern as oaProfileRef.
  const infoRequestRef: { tracker: InfoRequestTracker | null } = { tracker: null };
  const infoRequestHook = { onInbound: (accountId: number, sourceId: string) => infoRequestRef.tracker ? infoRequestRef.tracker.onInbound(accountId, sourceId) : Promise.resolve() };

  // OA accounts have no zca session; their contact profiles come from the OA API instead.
  // The resolver is wired in the `if (cfg.oa)` block below once OA token infra exists.
  const oaProfileRef: { resolve: ((accountId: number, userId: string) => Promise<{ displayName: string; avatar?: string } | null>) | null } = { resolve: null };
  const oaHistoryRef: { getHistory: ((accountId: number, userId: string, limit?: number) => Promise<unknown[]>) | null } = { getHistory: null };
  const enrich = makeEnricher(sessions, chatwoot, (a, u) => (oaProfileRef.resolve ? oaProfileRef.resolve(a, u) : Promise.resolve(null)), app.log);
  const consult = new ConsultationTracker(conversations, async (accountId, sourceId, text) => {
    const convId = await conversations.getChatwootId(accountId, sourceId);
    if (convId) await (await appClientFor(accountId)).postPrivateNote(convId, text);
  });
  const watermarkHook = {
    onRelayed: (accountId: number, timeMs: number) =>
      accounts.advanceWatermark(accountId, timeMs).catch((err) => app.log.warn({ event: "watermark_advance_failed", accountId, err }, "watermark advance failed")),
  };
  const inbound = new InboundHandler(
    chatwoot, mapping, conversations, enrich, appClientFor, archive, cfg.maxAttachmentBytes, app.log,
    consult, infoRequestHook, watermarkHook,
    (accountId, groupId) => sessions.getGroupInfo(accountId, groupId).catch(() => null),
    (accountId, uid) => sessions.getUserInfo(accountId, uid).catch(() => null),
    (accountId, userId, limit) => (oaHistoryRef.getHistory ? oaHistoryRef.getHistory(accountId, userId, limit) : Promise.resolve([])),
  );
  const notifyOutbound = makeOutboundNotifier((id) => inboxIndex.get(id) ?? null, accounts, conversations, appClientFor, app.log);
  const outbound = new OutboundHandler(
    sessions, accounts, (id) => inboxIndex.get(id) ?? null, mapping, cfg.chatwootBaseUrl,
    (evt, error) => notifyOutbound(evt, windowNote(evt, error)),
    app.log,
    consult,
    notifyOutbound,
    archive,
  );
  const reactions = new ReactionHandler(
    conversations,
    mapping,
    appClientFor,
    (accountId, uid) => sessions.getUserInfo(accountId, uid).catch(() => null),
  );
  const undos = new UndoHandler(conversations, mapping, appClientFor);

  // Wake the worker the instant a job is enqueued, so processing does not wait for the poll tick.
  let wakeWorker: () => void = () => {};
  let runStartupBackfill: () => void = () => {};

  // DURABLE PATH: a Zalo message is persisted to job_queue before any Chatwoot call.
  const onInbound = (accountId: number, msg: IncomingMessage): void => {
    jobs.enqueue("inbound", `${accountId}:${msg.msgId}`, { accountId, msg })
      .then(() => wakeWorker())
      .catch((err) => app.log.error({ err }, "failed to enqueue inbound"));
  };

  const onReaction = (accountId: number, evt: ReactionEvent): void => {
    jobs.enqueue("reaction", `${accountId}:${evt.reactedMsgId}:${evt.icon}:${evt.isSelf}`, { accountId, evt })
      .then(() => wakeWorker())
      .catch((err) => app.log.error({ err }, "failed to enqueue reaction"));
  };

  const onUndo = (accountId: number, evt: UndoEvent): void => {
    jobs.enqueue("undo", `${accountId}:${evt.recalledMsgId}`, { accountId, evt })
      .then(() => wakeWorker())
      .catch((err) => app.log.error({ err }, "failed to enqueue undo"));
  };
  sessions.registerEventHandlers(onReaction, onUndo);

  // Worker dispatches queued jobs to the handlers.
  const dispatch = async (job: Job): Promise<void> => {
    if (job.kind === "inbound") {
      const { accountId, msg } = job.payload as { accountId: number; msg: IncomingMessage };
      const acc = await accounts.findById(accountId);
      if (acc) await inbound.handle(accountId, acc.chatwootInboxIdentifier, msg);
      return;
    }
    if (job.kind === "reaction") {
      const { accountId, evt } = job.payload as { accountId: number; evt: ReactionEvent };
      await reactions.handle(accountId, evt);
      return;
    }
    if (job.kind === "undo") {
      const { accountId, evt } = job.payload as { accountId: number; evt: UndoEvent };
      await undos.handle(accountId, evt);
      return;
    }
    await outbound.handle(job.payload as OutgoingEvent);
  };

  // On permanent failure of an outbound send, alert the agent in-conversation.
  const onPermanentFailure = async (job: Job, error: unknown): Promise<void> => {
    app.log.error({ event: "job_dead_lettered", kind: job.kind, dedupKey: job.dedupKey, err: error }, "job dead-lettered");
    if (job.kind !== "outbound") return;
    // The note identifies which message failed and carries the underlying error verbatim, so the
    // agent can tell what broke and how to fix it (not just "check the connection").
    await notifyOutbound(job.payload as OutgoingEvent, deadLetterNote(job.payload as OutgoingEvent, error));
  };

  const worker = new Worker(jobs, dispatch, onPermanentFailure);
  wakeWorker = () => worker.wake();

  const resolveProxyOptions = async (accountId: number): Promise<ProxyOptions> => {
    const acc = await accounts.findById(accountId);
    if (!acc?.proxyId) return {};
    const proxy = await proxyRepo.get(acc.proxyId);
    return buildProxyOptions(proxy);
  };

  const supervisor = new ReconnectSupervisor({
    loadCredentials: async (id) => {
      const blob = await mapping.loadCredentials(id);
      return blob ? decryptCredentials<any>(blob, cfg.credentialsKey) : null;
    },
    saveCredentials: async (id, creds) => {
      await mapping.saveCredentials(id, encryptCredentials(creds, cfg.credentialsKey));
    },
    createAdapter: async (accountId, creds) => ZcaAdapter.fromCredentials(creds, await resolveProxyOptions(accountId)),
    isAuthError: isZaloAuthError,
    register: (id, adapter) => sessions.register(id, adapter as any),
    unregister: (id) => sessions.remove(id),
    bindInbound: (id) => sessions.bindInbound(id, onInbound),
    setStatus: async (id, status) => {
      await accounts.updateStatus(id, status);
      if (status === "connected") await accounts.clearProxyPending(id);
    },
    schedule: (fn, ms) => { const t = setTimeout(fn, ms); return { cancel: () => clearTimeout(t) }; },
    log: app.log,
  });

  // Restore personal sessions (connected or mid-reconnect) under supervision.
  for (const acc of await accounts.listAll()) {
    if (acc.type === "oa") continue;
    if (acc.status !== "connected" && acc.status !== "reconnecting") continue;
    await supervisor.connect(acc.id).catch((err) => app.log.error({ event: "zalo_restore_failed", accountId: acc.id, err }, "failed to restore zalo session"));
  }

  const qr = new ZcaQrLoginService(supervisor, accounts, mapping, cfg.credentialsKey, resolveProxyOptions);

  await app.register(fastifyStatic, { root: join(here, "admin/public"), prefix: "/admin/" });
  // DURABLE PATH: webhook persists the event then returns 200 immediately.
  registerWebhookRoute(app, (evt) =>
    jobs.enqueue("outbound", String(evt.chatwootMessageId), evt).then(() => wakeWorker()), cfg.webhookSecret);
  registerMediaRoute(app, archive, cfg.credentialsKey);
  const requestRestart = (): void => {
    app.log.info("config changed via admin; restarting to apply");
    setTimeout(() => process.exit(0), 500);
  };
  app.get("/healthz", async () => ({ ok: true }));
  app.get("/zalo_verifier:rest", async (req, reply) => {
    try {
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      const filename = "zalo_verifier" + (req.params as any).rest;
      const candidates = [
        path.join(process.cwd(), "data", filename),
        path.join(process.cwd(), filename),
        path.join("/app/data", filename),
      ];
      for (const p of candidates) {
        try {
          const content = await fs.readFile(p, "utf-8");
          return reply.type("text/html; charset=utf-8").send(content);
        } catch {}
      }
      return reply.code(404).send({ error: "File not found" });
    } catch (e: any) {
      return reply.code(500).send({ error: e.message });
    }
  });
  let isSyncingAvatars = false;
  let avatarSyncProgress = { running: false, total: 0, current: 0, synced: 0, skipped: 0, failed: 0 };
  let runAvatarSyncImpl: () => Promise<any> = async () => avatarSyncProgress;

  registerAuthRoutes(app, { users: adminUsers, sessionSecret });
  registerAdminRoutes(app, accounts, qr, guard, {
    refreshInboxIndex: refreshIndex,
    applyProxy: async (id) => { await supervisor.remove(id); await supervisor.connect(id); },
    listChatwootAccounts: () => chatwootAdmin.listAccounts(),
    requireWrite: can("accounts.write"),
    chatwootTokenConfigured: cfg.chatwootApiAccessToken != null,
    triggerAvatarSync: () => runAvatarSyncImpl(),
    getAvatarSyncStatus: () => avatarSyncProgress,
  });
  registerAccountDeleteRoute(app, accounts, supervisor, refreshIndex, guard, can("accounts.write"));
  registerSettingsRoutes(app, settingsRepo, guard, requestRestart, can("settings.write"));
  registerLogsRoutes(app, logsRepo, guard);
  registerInfoCardRoutes(app, infoCard, guard, can("infocard.write"));
  registerProxyRoutes(app, proxyRepo, accounts, guard, can("proxy.write"));
  registerWebhookInfoRoutes(app, webhookUrls, guard);
  if (adminAuth) await adminAuth.registerRoutes(app);
  app.addHook("onReady", refreshIndex);

  if (cfg.oa) {
    const oaTokens = new OaTokenRepo(pool, cfg.credentialsKey);
    const oauth = new OaOAuthClient(cfg.oa.appId, cfg.oa.appSecret);

    // Enrich OA contacts (name + avatar) via OA user-detail API with fallback to conversation history.
    oaProfileRef.resolve = async (accountId, userId) => {
      try {
        const getToken = accessTokenProvider(oaTokens, oauth, accountId);
        const token = await getToken();
        let profile = null;
        try {
          profile = await fetchUserProfile(token, userId);
        } catch {
          profile = null;
        }
        if (!profile?.displayName || !profile?.avatar) {
          try {
            let msgs = await getConversationMessages(getToken, userId, 0, 10) as any[];
            if (!msgs || msgs.length === 0) {
              await new Promise(r => setTimeout(r, 600));
              msgs = await getConversationMessages(getToken, userId, 0, 10) as any[];
            }
            const m: any = msgs?.find((x: any) => (x.from_display_name && String(x.from_id) === String(userId)) || (x.to_display_name && String(x.to_id) === String(userId)))
                   || msgs?.find((x: any) => x.from_display_name || x.to_display_name);
            const resolvedName = (m && String(m.from_id) === String(userId) ? m.from_display_name : m?.to_display_name) || m?.from_display_name || m?.to_display_name;
            const resolvedAvatar = (m && String(m.from_id) === String(userId) ? m.from_avatar : m?.to_avatar) || m?.from_avatar || m?.to_avatar;
            const candidateName = profile?.displayName || resolvedName;
            if (candidateName && !/^[0-9]+$/.test(candidateName)) {
              profile = {
                displayName: String(candidateName),
                avatar: profile?.avatar || (resolvedAvatar ? String(resolvedAvatar) : undefined),
                sharedInfo: profile?.sharedInfo,
              };
              app.log.info({ event: "oa_profile_history_resolved", userId, name: profile.displayName, hasAvatar: !!profile.avatar }, "Resolved OA user profile from conversation history");
            }
          } catch (hErr) {
            app.log.warn({ event: "oa_profile_history_failed", userId, err: hErr }, "Failed to resolve profile from conversation history");
          }
        }
        if (profile?.displayName && /^[0-9]+$/.test(profile.displayName)) {
          return null; // Ignore numeric display names
        }
        return profile;
      } catch {
        return null;
      }
    };

    oaHistoryRef.getHistory = async (accountId, userId, limit = 30) => {
      try {
        const getToken = accessTokenProvider(oaTokens, oauth, accountId);
        return await getRecentConversationMessages(getToken, userId, limit);
      } catch (err) {
        app.log.warn({ event: "oa_get_history_failed", userId, err }, "Failed to get recent conversation messages");
        return [];
      }
    };

    infoRequestRef.tracker = new InfoRequestTracker(
      conversations,
      infoCard,
      (accountId, userId, card) => sendRequestUserInfo(accessTokenProvider(oaTokens, oauth, accountId), userId, card),
      app.log,
    );

    const onSharedInfo = async (accountId: number, event: any): Promise<void> => {
      const info = parseSharedInfo(event);
      if (!info) { app.log.info({ event: "shared_info_empty", accountId }, "user_submit_info had no usable fields"); return; }
      const userId = String(event?.sender?.id ?? "");
      if (!userId) return;
      const acc = await accounts.findById(accountId);
      if (!acc) return;
      const sourceId = encodeSourceId(ThreadKind.OaUser, userId);
      await applyContactInfo(chatwoot, acc.chatwootInboxIdentifier, sourceId, info, app.log);
    };

    const registerOaSender = (accountId: number): void => {
      sessions.registerSender(accountId, new OaSender(accessTokenProvider(oaTokens, oauth, accountId)));
    };
    for (const acc of await accounts.listAll()) {
      if (acc.type === "oa" && acc.status === "connected") registerOaSender(acc.id);
    }

    runStartupBackfill = () => {
      void (async () => {
        for (const acc of await accounts.listAll()) {
          if (acc.type !== "oa" || acc.status !== "connected" || !acc.zaloOaId) continue;
          try {
            const getToken = accessTokenProvider(oaTokens, oauth, acc.id);
            const watermark = await accounts.getWatermark(acc.id);
            if (watermark == null) {
              await accounts.advanceWatermark(acc.id, Date.now());
              app.log.info({ event: "backfill_baseline", accountId: acc.id }, "backfill watermark initialised (no catch-up on first run)");
              continue;
            }
            const client: HistoryClient = {
              listRecentChat: (oaId, offset, count) => listRecentChat(getToken, oaId, offset, count),
              getConversationMessages: (userId, offset, count) => getConversationMessages(getToken, userId, offset, count),
            };
            const res = await runBackfill(client, acc.zaloOaId, watermark, (msg) => onInbound(acc.id, msg), DEFAULT_CAPS, app.log);
            if (res.maxTimeMs > watermark) await accounts.advanceWatermark(acc.id, res.maxTimeMs);
            if (res.capped) app.log.warn({ event: "backfill_capped", accountId: acc.id, enqueued: res.enqueued }, "OA backfill hit caps; some messages may not have been pulled");
          } catch (err) {
            app.log.warn({ event: "backfill_failed", accountId: acc.id, err }, "OA startup backfill failed");
          }
        }
      })().catch((err) => app.log.warn({ event: "backfill_failed", err }, "OA startup backfill loop failed"));
    };

    await app.register(async (oaApp) => {
      registerOaWebhookRoute(oaApp, {
        appId: cfg.oa!.appId,
        oaSecretKey: cfg.oa!.secretKey ?? "",
        appSecret: cfg.oa!.appSecret,
        accounts,
        onInbound,
        onSharedInfo,
        enrich,
      });
    });
    registerOaOAuthRoutes(app, {
      oauth, tokens: oaTokens, accounts, redirectUri: cfg.oa.redirectUri, sessionSecret,
      fetchOaId: (at) => fetchOaId(at), onConnected: registerOaSender,
    });

    const stopRefresher = startOaTokenRefresher({ tokens: oaTokens, oauth, accounts, log: app.log });
    process.once("SIGTERM", stopRefresher);
    process.once("SIGINT", stopRefresher);
  }

  async function syncSingleContact(accountId: number, sourceId: string, inboxIdentifier: string): Promise<boolean> {
    try {
      const { kind, threadId } = decodeSourceId(sourceId);
      if (kind === ThreadKind.Group) {
        const group = await sessions.getGroupInfo(accountId, threadId).catch(() => null);
        if (group?.avatar) {
          await chatwoot.updateContact(inboxIdentifier, sourceId, { name: group.name, avatarUrl: group.avatar });
          return true;
        }
      } else if (kind === ThreadKind.User) {
        const user = await sessions.getUserInfo(accountId, threadId).catch(() => null);
        if (user?.avatar) {
          await chatwoot.updateContact(inboxIdentifier, sourceId, { name: user.displayName, avatarUrl: user.avatar });
          return true;
        }
      } else if (kind === ThreadKind.OaUser && oaProfileRef.resolve) {
        const p = await oaProfileRef.resolve(accountId, threadId).catch(() => null);
        if (p?.displayName && !/^[0-9]+$/.test(p.displayName)) {
          await chatwoot.updateContact(inboxIdentifier, sourceId, { name: p.displayName, avatarUrl: p.avatar });
          return true;
        }
      }
    } catch {}
    return false;
  }

  runAvatarSyncImpl = async () => {
    if (isSyncingAvatars) return avatarSyncProgress;
    isSyncingAvatars = true;
    avatarSyncProgress = { running: true, total: 0, current: 0, synced: 0, skipped: 0, failed: 0 };

    void (async () => {
      try {
        const res = await pool.query(
          `SELECT zc.zalo_account_id, zc.source_id, za.chatwoot_inbox_identifier
           FROM zalo_conversations zc
           JOIN zalo_accounts za ON za.id = zc.zalo_account_id
           ORDER BY zc.last_inbound_at DESC NULLS LAST`
        );
        avatarSyncProgress.total = res.rows.length;
        app.log.info({ total: res.rows.length }, "Starting avatar batch sync");

        for (let i = 0; i < res.rows.length; i++) {
          const row = res.rows[i];
          avatarSyncProgress.current = i + 1;
          try {
            const synced = await syncSingleContact(Number(row.zalo_account_id), row.source_id, row.chatwoot_inbox_identifier);
            if (synced) {
              avatarSyncProgress.synced++;
            } else {
              avatarSyncProgress.skipped++;
            }
          } catch {
            avatarSyncProgress.failed++;
          }
          await new Promise((r) => setTimeout(r, 60));
        }
        app.log.info(avatarSyncProgress, "Avatar batch sync finished");
      } catch (e) {
        app.log.error({ err: e }, "Avatar batch sync error");
      } finally {
        avatarSyncProgress.running = false;
        isSyncingAvatars = false;
      }
    })();

    return avatarSyncProgress;
  };

  app.post("/internal/sync-avatars", async () => {
    return runAvatarSyncImpl();
  });
  app.get("/internal/sync-avatars", async () => {
    return avatarSyncProgress;
  });

  await app.listen({ host: "0.0.0.0", port: cfg.port });
  worker.start();
  runStartupBackfill();

  const indexRefresh = setInterval(() => { refreshIndex().catch((err) => app.log.error({ err }, "index refresh failed")); }, 30_000);
  indexRefresh.unref();

  // Re-persist live cookies every 30 min so a restart logs in with a fresh cookie, not the QR-time one.
  const cookieTimer = setInterval(() => { void supervisor.persistAllCookies(); }, 30 * 60 * 1000);
  cookieTimer.unref();

  // Periodic contact profile and avatar sync (every 15 minutes), and once 5s after startup
  setTimeout(() => { void runAvatarSyncImpl(); }, 5000);
  const syncTimer = setInterval(() => { void runAvatarSyncImpl(); }, 15 * 60 * 1000);
  syncTimer.unref();

  async function shutdown(): Promise<void> {
    worker.stop();
    clearInterval(indexRefresh);
    clearInterval(cookieTimer);
    clearInterval(syncTimer);
    try { await supervisor.persistAllCookies(); } catch { /* ignore */ }
    try { await sessions.stopAll(); } catch { /* ignore */ }
    try { await app.close(); } catch { /* ignore */ }
    try { await pool.end(); } catch { /* ignore */ }
  }
  process.once("SIGTERM", () => { shutdown().finally(() => process.exit(0)); });
  process.once("SIGINT", () => { shutdown().finally(() => process.exit(0)); });

  app.log.info(`zca-bridge listening on ${cfg.port}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
