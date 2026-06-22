import { ScreenWrapper } from './components/screen-wrappter';
import type { ComponentType } from 'react';

interface ScreenConfig {
  footer?: string;
}

export const buildScreen = <PropType extends object>(
  Component: ComponentType<PropType>,
  config: ScreenConfig = {}
): ComponentType<PropType> => {
  const WrappedComponent = (props: PropType) => (
    <ScreenWrapper footerText={config.footer}>
      <Component {...props} />
    </ScreenWrapper>
  );

  WrappedComponent.displayName = `${Component.displayName ?? Component.name ?? 'Component'}Screen`;

  return WrappedComponent;
};
