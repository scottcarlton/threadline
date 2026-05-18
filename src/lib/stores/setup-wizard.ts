import { writable } from 'svelte/store';

export type SetupStep = {
	id: string;
	question: string;
	type: 'text' | 'single' | 'multi' | 'yesno';
	options?: { label: string; value: string }[];
	placeholder?: string;
	skipLabel?: string;
};

type SetupWizardState = {
	active: boolean;
	steps: SetupStep[];
	currentIndex: number;
	answers: Record<string, string | string[]>;
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
				if (s.currentIndex > 0) s.currentIndex--;
				return s;
			});
		},
		goNext() {
			update((s) => {
				if (s.currentIndex < s.steps.length - 1) s.currentIndex++;
				return s;
			});
		},
		saveAnswer(stepId: string, answer: string | string[]) {
			update((s) => {
				s.answers[stepId] = answer;
				return s;
			});
		},
		close() {
			set({ active: false, steps: [], currentIndex: 0, answers: {} });
		}
	};
}

export const setupWizard = createSetupWizardStore();
