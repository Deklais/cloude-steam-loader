import { ReactNode } from 'react';

interface PlaceholderProps {
	body: ReactNode;
	children?: ReactNode;
	header: ReactNode;
	icon?: ReactNode;
}

/**
 * Used for errors or when there is nothing to display, i.e. no updates -> good
 * to go, etc.
 */
export function Placeholder(props: PlaceholderProps) {
	const { body, children, header, icon } = props;
	return (
		<div className="CloudePlaceholder_Container">
			<div className="CloudePlaceholder_Icon">{icon}</div>
			<div className="CloudePlaceholder_Header">{header}</div>
			<div className="CloudePlaceholder_Text">{body}</div>
			{children && <div className="CloudePlaceholder_Buttons">{children}</div>}
		</div>
	);
}
