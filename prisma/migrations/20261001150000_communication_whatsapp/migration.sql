-- WhatsApp click-to-chat reminders: the Comms log records each send attempt
-- (the manager's own WhatsApp opens with the message; delivery isn't confirmed).
ALTER TYPE "CommunicationType" ADD VALUE IF NOT EXISTS 'WHATSAPP';
