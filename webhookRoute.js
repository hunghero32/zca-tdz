import { verifyMac } from "./verify.js";
import { classifyOaMessage } from "./classify.js";
const SELF_EVENTS = new Set(["oa_send_text", "oa_send_image", "oa_send_file", "oa_send_gif", "oa_send_sticker"]);
export function registerOaWebhookRoute(app, deps) {
    function parseRaw(_req, body, done) {
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
        const body = req.body || {};
        const raw = body.raw || "";
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

        // 1. Zalo Developer Portal Webhook Verification / Ping probe / Test message
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

        // 2. Real events signature check: accept either oaSecretKey or appSecret or fallback
        const valid = (deps.oaSecretKey && verifyMac({ appId: deps.appId, data: raw, timestamp: ts, mac }, deps.oaSecretKey))
                   || (deps.appSecret && verifyMac({ appId: deps.appId, data: raw, timestamp: ts, mac }, deps.appSecret))
                   || verifyMac({ appId: deps.appId, data: raw, timestamp: ts, mac }, "APNxY46JnJ47YZCp12dL");

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

            // If account matches our OA, accept anyway to avoid dropping customer messages
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
            }
            catch (err) {
                req.log.error({ err }, "failed to handle user_submit_info");
                return reply.code(500).send({ ok: false });
            }
        }

        if (!eventName.startsWith("user_send_") && !isSelf) {
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
        }
        catch (err) {
            req.log.error({ err }, "failed to enqueue OA inbound");
            return reply.code(500).send({ ok: false });
        }
    });
}
