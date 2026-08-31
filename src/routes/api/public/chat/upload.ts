import { createFileRoute } from "@tanstack/react-router";

/**
 * Visitor file attachments.
 *
 * Multipart upload from the chat widget. The website, organization and
 * visitor are derived from the *verified* signed session — never from the
 * request body. Files land in the private `chat-attachments` bucket and are
 * only reachable through short-lived signed URLs.
 */

const MAX_BYTES = 10 * 1024 * 1024;

const ALLOWED = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/heic",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

function safeName(name: string) {
  return (name || "attachment").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
}

export const Route = createFileRoute("/api/public/chat/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const mod = await import("@/lib/public-chat.server");
        try {
          const form = await request.formData();
          const session = String(form.get("session") ?? "");
          const host = form.get("host") ? String(form.get("host")) : null;
          const conversationId = form.get("conversationId")
            ? String(form.get("conversationId"))
            : null;
          const file = form.get("file");

          if (!(file instanceof File)) {
            return Response.json({ error: "No file was uploaded" }, { status: 400 });
          }
          if (file.size === 0 || file.size > MAX_BYTES) {
            return Response.json({ error: "Files must be under 10 MB" }, { status: 400 });
          }
          const type = file.type || "application/octet-stream";
          if (!ALLOWED.includes(type)) {
            return Response.json(
              { error: "That file type is not supported. Try an image, PDF or document." },
              { status: 400 },
            );
          }

          const ctx = await mod.sessionContext(session, host);
          const limits = await mod.orgLimits(ctx.claims.org);
          await mod.enforceRateLimit(`upload:s:${ctx.claims.sid}`, 10, 60);
          await mod.enforceRateLimit(
            `upload:ip:${mod.clientIp(request)}`,
            limits.ip_requests_per_minute,
            60,
          );

          const conversation = conversationId
            ? await mod.conversationForSession(ctx, conversationId)
            : await mod.ensureConversation(ctx.website, ctx.visitor, null, "Attachment");

          const name = safeName(file.name);
          const path = `${ctx.claims.org}/${conversation.id}/${crypto.randomUUID()}-${name}`;
          const db = mod.admin();
          const { error: uploadError } = await db.storage
            .from("chat-attachments")
            .upload(path, await file.arrayBuffer(), { contentType: type, upsert: false });
          if (uploadError) {
            console.error("[chat/upload]", uploadError);
            return Response.json({ error: "Could not upload that file" }, { status: 500 });
          }

          const message = await mod.insertMessage(
            conversation,
            "visitor",
            `Sent an attachment: ${file.name}`,
            "Visitor",
            { attachment: { path, name: file.name, type, size: file.size } },
          );

          const { data: signed } = await db.storage
            .from("chat-attachments")
            .createSignedUrl(path, 60 * 60);

          return Response.json({
            conversationId: conversation.id,
            messageId: message.id,
            attachment: { name: file.name, type, size: file.size, url: signed?.signedUrl ?? null },
          });
        } catch (error) {
          if (error instanceof mod.PublicChatError) {
            return Response.json({ error: error.message }, { status: error.status });
          }
          console.error("[chat/upload]", error);
          return Response.json({ error: "Could not upload that file" }, { status: 500 });
        }
      },
    },
  },
});
