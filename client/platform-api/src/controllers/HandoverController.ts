import type { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../config/db.js";
import { ulid } from "ulid";

export class HandoverController {
  static async listNotes(request: FastifyRequest<{ Params: { conversationId: string } }>, reply: FastifyReply) {
    const { conversationId } = request.params;
    const notes = await prisma.handoverNote.findMany({
      where: { conversationId },
      include: {
        author: { select: { id: true, username: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return reply.send(notes);
  }

  static async addNote(
    request: FastifyRequest<{ Params: { conversationId: string }; Body: { note: string } }>,
    reply: FastifyReply
  ) {
    const { conversationId } = request.params;
    const { note } = request.body ?? {};
    const user = (request as any).user;

    if (!note?.trim()) {
      return reply.code(400).send({ error: "Note content is required" });
    }

    // Conversation object doesn't exist in Prisma directly (it's derived from contact/messages).
    // We just assume conversationId is valid if passed.

    const newNote = await prisma.handoverNote.create({
      data: {
        id: ulid(),
        conversationId,
        authorId: user.id,
        body: note.trim(),
      },
      include: {
        author: { select: { id: true, username: true, name: true } },
      },
    });

    return reply.send(newNote);
  }

  static async deleteNote(
    request: FastifyRequest<{ Params: { conversationId: string; noteId: string } }>,
    reply: FastifyReply
  ) {
    const { conversationId, noteId } = request.params;
    const user = (request as any).user;

    const note = await prisma.handoverNote.findUnique({
      where: { id: noteId },
    });

    if (!note) {
      return reply.code(404).send({ error: "Note not found" });
    }

    if (note.authorId !== user.id && user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      return reply.code(403).send({ error: "Only the author or an admin can delete this note" });
    }

    await prisma.handoverNote.delete({
      where: { id: noteId },
    });

    return reply.send({ success: true });
  }
}
