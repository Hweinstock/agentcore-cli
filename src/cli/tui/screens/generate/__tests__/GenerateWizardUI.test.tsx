import { GenerateWizardUI } from '../GenerateWizardUI';
import { useGenerateWizard } from '../useGenerateWizard';
import { cleanup, render } from 'ink-testing-library';
import React, { act, useImperativeHandle } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

type Wizard = ReturnType<typeof useGenerateWizard>;

const Harness = React.forwardRef<Wizard, { credentialProjectName?: string }>((props, ref) => {
  const wizard = useGenerateWizard({ initialName: 'BmaEnv' });
  useImperativeHandle(ref, () => wizard);
  return (
    <GenerateWizardUI
      wizard={wizard}
      onBack={wizard.goBack}
      onConfirm={wizard.goBack}
      isActive={true}
      credentialProjectName={props.credentialProjectName}
    />
  );
});
Harness.displayName = 'Harness';

afterEach(cleanup);

describe.each([
  ['create', undefined],
  ['add agent', 'ExistingProject'],
] as const)('%s template wizard', (_name, credentialProjectName) => {
  it('renders the public name in template choices and confirmation', () => {
    const ref = React.createRef<Wizard>();
    const { lastFrame } = render(<Harness ref={ref} credentialProjectName={credentialProjectName} />);
    act(() => {
      ref.current!.setLanguage('Python');
      ref.current!.setBuildType('CodeZip');
      ref.current!.setProtocol('HTTP');
    });
    expect(lastFrame()).toContain('environment-python-bma');
    expect(lastFrame()).not.toContain('BedrockManagedAgents');

    act(() => ref.current!.setSdk('BedrockManagedAgents'));
    act(() => ref.current!.setAdvanced([]));
    expect(lastFrame()).toContain('Review Configuration');
    expect(lastFrame()).toContain('Framework: environment-python-bma');
    expect(lastFrame()).toContain('Build: Container');
    expect(lastFrame()).not.toContain('BedrockManagedAgents');
    expect(lastFrame()).not.toContain('Model Provider:');
  });
});
