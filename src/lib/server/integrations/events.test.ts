import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSlack = vi.fn().mockResolvedValue(undefined);
const mockDiscord = vi.fn().mockResolvedValue(undefined);
const mockTeams = vi.fn().mockResolvedValue(undefined);
const mockExecuteAgent = vi.fn().mockResolvedValue({ output: 'done' });

const mockSingle = vi.fn();
const mockEq = vi.fn().mockReturnValue({ single: mockSingle });
const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
const mockFrom = vi.fn().mockReturnValue({ select: mockSelect });

vi.mock('./slack.js', () => ({ sendSlackMessage: mockSlack }));
vi.mock('./discord.js', () => ({ sendDiscordMessage: mockDiscord }));
vi.mock('./microsoft/teams.js', () => ({ sendTeamsMessage: mockTeams }));
vi.mock('../supabase.js', () => ({
	supabaseAdmin: { from: mockFrom }
}));
vi.mock('../agent-executor.js', () => ({ executeAgent: mockExecuteAgent }));

const { emitOrderEvent, emitIntegrationEvent } = await import('./events.js');

const ORDER_ROW = {
	order_number: 'ORD-001',
	total_amount: 1500,
	accounts: { business_name: 'Acme Boutique' },
	brands: { name: 'Cool Brand' }
};

beforeEach(() => {
	vi.clearAllMocks();
	mockSingle.mockResolvedValue({ data: ORDER_ROW });
});

describe('emitOrderEvent', () => {
	it('emits order_submitted with full payload', async () => {
		await emitOrderEvent('org-1', 'order-1', 'submitted', 'https://app.test');

		expect(mockFrom).toHaveBeenCalledWith('orders');
		expect(mockSlack).toHaveBeenCalledWith(
			'org-1',
			expect.objectContaining({
				title: 'New Order Submitted',
				color: '#16a34a'
			})
		);
		expect(mockDiscord).toHaveBeenCalled();
		expect(mockTeams).toHaveBeenCalled();

		const slackMsg = mockSlack.mock.calls[0][1];
		expect(slackMsg.text).toContain('ORD-001');
		expect(slackMsg.text).toContain('Acme Boutique');
		expect(slackMsg.text).toContain('Cool Brand');
		expect(slackMsg.text).toContain('1,500');
		expect(slackMsg.url).toBe('https://app.test/orders/order-1');
	});

	it('emits order_confirmed without brand/total', async () => {
		await emitOrderEvent('org-1', 'order-2', 'confirmed', 'https://app.test');

		const slackMsg = mockSlack.mock.calls[0][1];
		expect(slackMsg.title).toBe('Order Confirmed');
		expect(slackMsg.text).toContain('ORD-001');
		expect(slackMsg.text).toContain('confirmed');
	});

	it('emits order_shipped', async () => {
		await emitOrderEvent('org-1', 'order-3', 'shipped', 'https://app.test');

		const slackMsg = mockSlack.mock.calls[0][1];
		expect(slackMsg.title).toBe('Order Shipped');
		expect(slackMsg.color).toBe('#7c3aed');
	});

	it('emits order_cancelled with reason', async () => {
		await emitOrderEvent('org-1', 'order-4', 'cancelled', 'https://app.test', {
			reason: 'Out of stock'
		});

		const slackMsg = mockSlack.mock.calls[0][1];
		expect(slackMsg.title).toBe('Order Cancelled');
		expect(slackMsg.text).toContain('Out of stock');
		expect(slackMsg.color).toBe('#dc2626');
	});

	it('emits order_cancelled without reason', async () => {
		await emitOrderEvent('org-1', 'order-5', 'cancelled', 'https://app.test');

		const slackMsg = mockSlack.mock.calls[0][1];
		expect(slackMsg.text).not.toContain('undefined');
	});

	it('does not throw when order lookup returns null', async () => {
		mockSingle.mockResolvedValue({ data: null });
		await expect(
			emitOrderEvent('org-1', 'missing', 'submitted', 'https://app.test')
		).resolves.toBeUndefined();
		expect(mockSlack).not.toHaveBeenCalled();
	});

	it('does not throw when supabase query fails', async () => {
		mockSingle.mockRejectedValue(new Error('db down'));
		await expect(
			emitOrderEvent('org-1', 'err', 'submitted', 'https://app.test')
		).resolves.toBeUndefined();
	});
});

describe('emitIntegrationEvent', () => {
	it('sends new_account to all channels', async () => {
		await emitIntegrationEvent('org-1', 'new_account', {
			accountName: 'Test Store',
			city: 'Austin',
			state: 'TX',
			url: 'https://app.test/accounts/a1'
		});

		expect(mockSlack).toHaveBeenCalledWith(
			'org-1',
			expect.objectContaining({
				title: 'New Account Created'
			})
		);
		const slackMsg = mockSlack.mock.calls[0][1];
		expect(slackMsg.text).toContain('Test Store');
		expect(slackMsg.text).toContain('Austin, TX');
	});
});
