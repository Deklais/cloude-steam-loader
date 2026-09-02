import { FC, ReactNode, createContext, useContext, useEffect, useState } from 'react';
import { EUIMode } from '../../globals/steam-client/shared';

interface PublicCloudeGlobalComponentsState {
	components: Map<EUIMode, Map<string, FC>>;
}

export class CloudeGlobalComponentsState {
	// TODO a set would be better
	private _components = new Map<EUIMode, Map<string, FC>>([
		[EUIMode.GamePad, new Map()],
		[EUIMode.Desktop, new Map()],
	]);

	public eventBus = new EventTarget();

	publicState(): PublicCloudeGlobalComponentsState {
		return { components: this._components };
	}

	addComponent(path: string, component: FC, uiMode: EUIMode) {
		const components = this._components.get(uiMode);
		if (!components) throw new Error(`UI mode ${uiMode} not supported.`);

		components.set(path, component);
		this.notifyUpdate();
	}

	removeComponent(path: string, uiMode: EUIMode) {
		const components = this._components.get(uiMode);
		if (!components) throw new Error(`UI mode ${uiMode} not supported.`);

		components.delete(path);
		this.notifyUpdate();
	}

	private notifyUpdate() {
		this.eventBus.dispatchEvent(new Event('update'));
	}
}

interface CloudeGlobalComponentsContext extends PublicCloudeGlobalComponentsState {
	addComponent(path: string, component: FC, uiMode: EUIMode): void;
	removeComponent(path: string, uiMode: EUIMode): void;
}

const CloudeGlobalComponentsContext = createContext<CloudeGlobalComponentsContext>(null as any);

export const useCloudeGlobalComponentsState = () => useContext(CloudeGlobalComponentsContext);

interface Props {
	cloudeGlobalComponentsState: CloudeGlobalComponentsState;
	children: ReactNode;
}

export const CloudeGlobalComponentsStateContextProvider: FC<Props> = ({ children, cloudeGlobalComponentsState: cloudeGlobalComponentsState }) => {
	const [publicCloudeGlobalComponentsState, setPublicCloudeGlobalComponentsState] = useState<PublicCloudeGlobalComponentsState>({
		...cloudeGlobalComponentsState.publicState(),
	});

	useEffect(() => {
		function onUpdate() {
			setPublicCloudeGlobalComponentsState({ ...cloudeGlobalComponentsState.publicState() });
		}

		cloudeGlobalComponentsState.eventBus.addEventListener('update', onUpdate);

		return () => cloudeGlobalComponentsState.eventBus.removeEventListener('update', onUpdate);
	}, []);

	const addComponent = cloudeGlobalComponentsState.addComponent.bind(cloudeGlobalComponentsState);
	const removeComponent = cloudeGlobalComponentsState.removeComponent.bind(cloudeGlobalComponentsState);

	return (
		<CloudeGlobalComponentsContext.Provider value={{ ...publicCloudeGlobalComponentsState, addComponent, removeComponent }}>
			{children}
		</CloudeGlobalComponentsContext.Provider>
	);
};
