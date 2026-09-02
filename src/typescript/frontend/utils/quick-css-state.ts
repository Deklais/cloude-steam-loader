import { produce } from 'immer';
import { useSyncExternalStore } from 'react';

interface QuickCssState {
	isCloudeOpen: boolean;
	editorCode: string;
	isWatching: boolean;
}

class Store<T> {
	private state: T;
	private listeners = new Set<(state: T) => void>();

	constructor(initialState: T) {
		this.state = initialState;
	}

	getState(): T {
		return this.state;
	}

	setState(updater: (draft: T) => void): void {
		this.state = produce(this.state, updater);
		this.listeners.forEach((listener) => listener(this.state));
	}

	subscribe(listener: (state: T) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
}

export const quickCssStore = new Store<QuickCssState>({
	isCloudeOpen: false,
	editorCode: '',
	isWatching: false,
});

export function useQuickCssState(): QuickCssState {
	return useSyncExternalStore(
		(callback) => quickCssStore.subscribe(callback),
		() => quickCssStore.getState(),
	);
}

export function setIsCloudeOpen(value: boolean): void {
	quickCssStore.setState((d) => {
		d.isCloudeOpen = value;
	});
}

export function setEditorCode(code: string): void {
	quickCssStore.setState((d) => {
		d.editorCode = code;
	});
}

export function setIsWatching(value: boolean): void {
	quickCssStore.setState((d) => {
		d.isWatching = value;
	});
}
