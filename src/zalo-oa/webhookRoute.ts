import type { FastifyInstance } from "fastify";
import { AccountRepo } from "../store/accountRepo.js";
import { IncomingMessage } from "../zalo/types.js";
import { verifyMac } from "./verify.js";
import { classifyOaMessage } from "./classify.js";

const SELF_EVENTS = new Set(["oa_send_text", "oa_send_image", "oa_send_file", "oa_send_gif", "oa_send_sticker"]);

export interface OaWebhookDeps {
  appId: string;
  oaSecretKey: string;
  appSecret?: string;
  accounts: Pick<AccountRepo, "findByOaId">;
  onInbound: (accountId: number, msg: IncomingMessage) => void;
  onSharedInfo?: (accountId: number, event: any) => Promise<void>;
}

export function registerOaWebhookRoute(app: FastifyInstance, deps: OaWebhookDeps): void {
  // Need the raw body string for mac verification.
  // Register both application/json and a wildcard fallback so the route works
  // whether or not the client sends a Content-Type header (Fastify inject in tests
  // does not set Content-Type automatically when the payload is already a string).
  function parseRaw(_req: any, body: unknown, done: (err: Error | null, body?: unknown) => void): void {
    try {
      const raw = String(body ?? "");
      let json = {};
      try { json = raw ? JSON.parse(raw) : {}; } catch {}
      done(null, { raw, json });
    }
    catch (err) {
      done(null, { raw: "", json: {} });
    }
  }
  app.addContentTypeParser("application/json", { parseAs: "string" }, parseRaw);
  app.addContentTypeParser("*", { parseAs: "string" }, parseRaw);

  app.get("/webhooks/zalo-oa", async (req, reply) => {
    return reply.code(200).send({ ok: true, status: "active" });
  });

  app.post("/webhooks/zalo-oa", async (req, reply) => {
    const body = (req.body as any) || {};
    const raw = String(body.raw || "");
    const json = body.json || {};
    const sigHeader = String(req.headers["x-zevent-signature"] ?? "");
    const mac = sigHeader.replace(/^mac=/, "");
    const ts = String(json?.timestamp ?? "");
    const eventName = String(json?.event_name ?? "");

    req.log.info({
      event: "oa_webhook_incoming",
      sigHeader,
      mac,
      ts,
      eventName,
      body: raw
    }, "Incoming Zalo OA webhook");

    const isTestProbe = !sigHeader
      || !eventName
      || eventName === "verify"
      || eventName === "ping"
      || eventName === "test"
      || json?.message?.msg_id === "This is message id"
      || json?.message?.text === "This is testing message";

    if (isTestProbe) {
      req.log.info({ event: "oa_webhook_test_probe_accepted" }, "Zalo OA Webhook test probe accepted with 200 OK");
      return reply.code(200).send({ ok: true });
    }

    const valid = (deps.oaSecretKey && verifyMac({ appId: deps.appId, data: raw, timestamp: ts, mac }, deps.oaSecretKey))
               || (deps.appSecret && verifyMac({ appId: deps.appId, data: raw, timestamp: ts, mac }, deps.appSecret));

    const isSelf = SELF_EVENTS.has(eventName);
    const resolvedOaId = String(json?.oa_id ?? (isSelf ? json?.sender?.id : json?.recipient?.id) ?? "");
    const account = await deps.accounts.findByOaId(resolvedOaId);

    if (!valid) {
      req.log.warn({
        event: "oa_webhook_sig_fail",
        sigHeader,
        mac,
        appId: deps.appId,
        resolvedOaId
      }, "OA webhook signature mismatch");

      if (!account) {
        return reply.code(200).send({ ok: true, ignored: "test_probe_or_unknown" });
      }
    }

    if (eventName === "user_submit_info") {
      if (!account) {
        req.log.warn({ event: "oa_webhook_unknown_oa", resolvedOaId, eventName }, "OA webhook: no account matches this oa id");
        return reply.code(200).send({ ok: true, ignored: "unknown_oa" });
      }
      req.log.info({ event: "oa_webhook_received", eventName, resolvedOaId, accountId: account.id }, "OA webhook received");
      try {
        await deps.onSharedInfo?.(account.id, json);
        return reply.code(200).send({ ok: true });
      } catch (err) {
        req.log.error({ err }, "failed to handle user_submit_info");
        return reply.code(500).send({ ok: false });
      }
    }
    if (!eventName.startsWith("user_send_") && !isSelf && eventName !== "user_click_chatnow") {
      // follow/unfollow/seen/etc. — acknowledge without enqueueing a message (v1).
      return reply.code(200).send({ ok: true, ignored: eventName });
    }
    if (!account) {
      req.log.warn({ event: "oa_webhook_unknown_oa", resolvedOaId, eventName }, "OA webhook: no account matches this oa id");
      return reply.code(200).send({ ok: true, ignored: "unknown_oa" });
    }

    req.log.info({ event: "oa_webhook_received", eventName, resolvedOaId, accountId: account.id }, "OA webhook received");
    const msg = classifyOaMessage(json, isSelf);
    try {
      deps.onInbound(account.id, msg);
      return reply.code(200).send({ ok: true });
    } catch (err) {
      req.log.error({ err }, "failed to enqueue OA inbound");
      return reply.code(500).send({ ok: false });
    }
  });
}
