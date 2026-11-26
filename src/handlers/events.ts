import type { AppClientFor } from "../chatwoot/appClientFactory.js";
import { ConversationRepo } from "../store/conversationRepo.js";
import { MappingRepo } from "../store/mappingRepo.js";
import { ReactionEvent, UndoEvent, UserProfile, ZaloThreadKind } from "../zalo/types.js";
import { encodeSourceId, ThreadKind } from "../routing/sourceId.js";
import { isReactionRemoval, reactionEmoji } from "../zalo/reactionIcons.js";

type UserProfileResolver = (accountId: number, uid: string) => Promise<UserProfile | null>;

function sourceIdFor(kind: ZaloThreadKind, threadId: string): string {
  if (kind === ZaloThreadKind.Group) return encodeSourceId(ThreadKind.Group, threadId);
  if (kind === ZaloThreadKind.OaUser) return encodeSourceId(ThreadKind.OaUser, threadId);
  return encodeSourceId(ThreadKind.User, threadId);
}

// A Zalo reaction has no Chatwoot API equivalent, so it surfaces as a private note (agents only).
// The note is threaded onto the reacted message via in_reply_to when we can resolve it.
export class ReactionHandler {
  private nameCache = new Map<string, string>(); // `${accountId}:${uid}` -> displayName

  constructor(
    private conversations: ConversationRepo,
    private mapping: MappingRepo,
    private appClientFor: AppClientFor,
    private userProfile?: UserProfileResolver,
  ) {}

  async handle(accountId: number, evt: ReactionEvent): Promise<void> {
    if (isReactionRemoval(evt.icon)) return; // un-reacting is not surfaced
    const conversationId = await this.conversations.getChatwootId(accountId, sourceIdFor(evt.kind, evt.threadId));
    if (!conversationId) return; // no conversation yet → nothing to annotate

    const reacted = await this.mapping.findByZaloMsgId(accountId, evt.reactedMsgId);
    let who = "Ai đó";
    if (evt.isSelf) {
      who = "Bạn";
    } else if (evt.senderName && !/^[0-9]+$/.test(evt.senderName)) {
      who = evt.senderName;
    } else if (evt.senderUid) {
      const cacheKey = `${accountId}:${evt.senderUid}`;
      const cached = this.nameCache.get(cacheKey);
      if (cached) {
        who = cached;
      } else if (this.userProfile) {
        try {
          const profile = await this.userProfile(accountId, evt.senderUid);
          if (profile?.displayName && !/^[0-9]+$/.test(profile.displayName)) {
            who = profile.displayName;
            this.nameCache.set(cacheKey, who);
          }
        } catch {
          // best-effort lookup
        }
      }
      if (who === "Ai đó" || /^[0-9]+$/.test(who)) {
        const shortId = evt.senderUid.length > 4 ? evt.senderUid.slice(-4) : evt.senderUid;
        who = `Thành viên #${shortId}`;
      }
    }

    const note = `${reactionEmoji(evt.icon)} ${who} đã thả cảm xúc`;
    const appClient = await this.appClientFor(accountId);
    await appClient.postPrivateNote(conversationId, note, { inReplyTo: reacted?.chatwootMessageId ?? undefined });
  }
}

// Message recall. Per product rule, only the operator's OWN recall (isSelf) is mirrored: the
// corresponding Chatwoot message is deleted. A customer recall is intentionally ignored.
export class UndoHandler {
  constructor(
    private conversations: ConversationRepo,
    private mapping: MappingRepo,
    private appClientFor: AppClientFor,
  ) {}

  async handle(accountId: number, evt: UndoEvent): Promise<void> {
    if (!evt.isSelf) return;
    const mapped = await this.mapping.findByZaloMsgId(accountId, evt.recalledMsgId);
    if (!mapped?.chatwootMessageId) return; // never relayed → nothing to delete
    const conversationId = await this.conversations.getChatwootId(accountId, sourceIdFor(evt.kind, evt.threadId));
    if (!conversationId) return;
    const appClient = await this.appClientFor(accountId);
    await appClient.deleteMessage(conversationId, mapped.chatwootMessageId);
  }
}
