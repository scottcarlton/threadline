export type MessagingChannel = 'whatsapp' | 'sms';

export type SessionStatus = 'active' | 'expired' | 'completed';

export type ReceivedMessage = {
	messageId: string;
	from: string;
	to: string;
	body: string | null;
	mediaUrl: string | null;
	mediaType: string | null;
	channel: MessagingChannel;
	timestamp: string;
};

export type MessagingSession = {
	id: string;
	profileId: string;
	organizationId: string;
	phoneNumber: string;
	channel: MessagingChannel;
	conversationHistory: ConversationMessage[];
	status: SessionStatus;
	createdAt: string;
	updatedAt: string;
	expiresAt: string;
};

export type ConversationMessage = {
	role: 'user' | 'assistant';
	content: string;
	timestamp: string;
	mediaUrl?: string;
};
