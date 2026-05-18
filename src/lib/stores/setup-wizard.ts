import { writable } from 'svelte/store';

export type SetupStep = {
	id: string;
	question: string;
	type: 'address' | 'single' | 'multi' | 'yesno';
	options?: { label: string; value: string }[];
	skipLabel?: string;
};

type SetupWizardState = {
	active: boolean;
	steps: SetupStep[];
	currentIndex: number;
	answers: Record<string, unknown>;
};

function createSetupWizardStore() {
	const { subscribe, set, update } = writable<SetupWizardState>({
		active: false,
		steps: [],
		currentIndex: 0,
		answers: {}
	});

	return {
		subscribe,
		start(steps: SetupStep[]) {
			set({ active: true, steps, currentIndex: 0, answers: {} });
		},
		goBack() {
			update((s) => {
				if (s.currentIndex > 0) {
					return { ...s, currentIndex: s.currentIndex - 1 };
				}
				return s;
			});
		},
		goNext() {
			update((s) => {
				if (s.currentIndex < s.steps.length - 1) {
					return { ...s, currentIndex: s.currentIndex + 1 };
				}
				return s;
			});
		},
		saveAnswer(stepId: string, answer: unknown) {
			update((s) => {
				return { ...s, answers: { ...s.answers, [stepId]: answer } };
			});
		},
		close() {
			set({ active: false, steps: [], currentIndex: 0, answers: {} });
		}
	};
}

export const setupWizard = createSetupWizardStore();
