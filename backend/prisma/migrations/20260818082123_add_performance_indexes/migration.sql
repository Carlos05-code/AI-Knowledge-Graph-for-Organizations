-- CreateIndex
CREATE INDEX "Chunk_documentId_idx" ON "Chunk"("documentId");

-- CreateIndex
CREATE INDEX "Connector_organizationId_deletedAt_idx" ON "Connector"("organizationId", "deletedAt");

-- CreateIndex
CREATE INDEX "ConnectorRun_connectorId_createdAt_idx" ON "ConnectorRun"("connectorId", "createdAt");

-- CreateIndex
CREATE INDEX "Conversation_userId_updatedAt_idx" ON "Conversation"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "Document_organizationId_deletedAt_status_idx" ON "Document"("organizationId", "deletedAt", "status");

-- CreateIndex
CREATE INDEX "Document_organizationId_checksum_idx" ON "Document"("organizationId", "checksum");

-- CreateIndex
CREATE INDEX "Document_status_idx" ON "Document"("status");

-- CreateIndex
CREATE INDEX "DocumentVersion_documentId_idx" ON "DocumentVersion"("documentId");

-- CreateIndex
CREATE INDEX "Meeting_organizationId_deletedAt_idx" ON "Meeting"("organizationId", "deletedAt");

-- CreateIndex
CREATE INDEX "Meeting_organizerId_idx" ON "Meeting"("organizerId");

-- CreateIndex
CREATE INDEX "MeetingParticipant_meetingId_idx" ON "MeetingParticipant"("meetingId");

-- CreateIndex
CREATE INDEX "MeetingParticipant_userId_idx" ON "MeetingParticipant"("userId");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_createdAt_idx" ON "Notification"("userId", "isRead", "createdAt");

-- CreateIndex
CREATE INDEX "Policy_organizationId_deletedAt_idx" ON "Policy"("organizationId", "deletedAt");

-- CreateIndex
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");
