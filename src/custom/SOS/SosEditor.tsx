import React, { forwardRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';

import { Editor } from '@components/editor';
import { EditorHandlingClose, useEditorHandlingClose } from '@components/editor/useHandleCloseEditor';
import { Input, InputWithTopLabelContainer, Label, PaddedInputContainer, Toggle } from '@components/inputs';
import { useCreaturePage } from '@hooks/usePage';

import { SosAllyTable } from './SosAllyTable';
import { useSosConfig } from './sosConfigStore';
import { isSosEnabled, type SosAlly, type SosEntry } from './types';

const SectionLabel = styled(Label)`
  ${({ theme }) => theme.fonts.normalMedium};
  color: ${({ theme }) => theme.colors.text100};
`;

const Hint = styled.p`
  ${({ theme }) => theme.fonts.normalSmall};
  color: ${({ theme }) => theme.colors.text400};
  margin: -4px 0 0;
`;

// A label + toggle on one line, the shape Studio uses for its boolean settings.
const ToggleLine = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
`;

const RateField = styled.div`
  & input {
    width: 100%;
  }
`;

// Dim the pool when SOS is off: the config is preserved and still editable, but
// visibly inactive until the caller is switched back on.
const Section = styled.div<{ $muted: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 16px;
  opacity: ${({ $muted }) => ($muted ? 0.5 : 1)};
  transition: opacity 120ms ease;
`;

/**
 * Right-side editor for a creature's SOS configuration. Edits apply live to the
 * SOS config store (which parks them for the bottom-left "Save data" button), so
 * there is nothing to commit on close.
 *
 * SOS is opt-out: a creature calls for help by default, and only writes an entry
 * once it departs from that — switched off, or given specific allies (with form
 * and, optionally, weights) or its own base call rate. An empty pool leans on the
 * plugin's own kin/family fallback; a blank rate uses the global SOS Settings rate.
 */
export const SosEditor = forwardRef<EditorHandlingClose>((_, ref) => {
  const { t } = useTranslation();
  const { creature } = useCreaturePage();
  const { getEntry, setEntry } = useSosConfig();

  const dbSymbol = creature.dbSymbol;
  const entry = getEntry(dbSymbol);

  const [enabled, setEnabled] = useState<boolean>(isSosEnabled(entry));
  const [allies, setAllies] = useState<SosAlly[]>(entry?.allies ?? []);
  const [weighted, setWeighted] = useState<boolean>((entry?.allies ?? []).some((ally) => ally.weight !== undefined));
  const [rateText, setRateText] = useState<string>(entry?.call_rate !== undefined ? String(entry.call_rate) : '');

  // Push the current draft into the store. Rows with no species are dropped so
  // the config never carries a blank ally; the store decides on its own whether
  // the whole entry is empty enough to delete.
  const sync = (nextEnabled: boolean, nextAllies: SosAlly[], nextRateText: string) => {
    const filtered = nextAllies.filter((ally) => ally.species && ally.species !== '__undef__');
    const parsedRate = parseInt(nextRateText, 10);
    const draft: SosEntry = { enabled: nextEnabled, allies: filtered };
    if (Number.isFinite(parsedRate) && parsedRate > 0) draft.call_rate = parsedRate;
    setEntry(dbSymbol, draft);
  };

  const onEnabledChange = (next: boolean) => {
    setEnabled(next);
    sync(next, allies, rateText);
  };

  const onAlliesChange = (next: SosAlly[]) => {
    setAllies(next);
    sync(enabled, next, rateText);
  };

  const onRateChange = (next: string) => {
    setRateText(next);
    sync(enabled, allies, next);
  };

  // Flip weighting on/off across the whole pool: adding a default weight of 1 to
  // every ally, or stripping weights so the draw goes back to uniform.
  const onWeightedChange = (next: boolean) => {
    setWeighted(next);
    const rewritten = allies.map((ally): SosAlly =>
      next ? { ...ally, weight: ally.weight ?? 1 } : { species: ally.species, form: ally.form }
    );
    setAllies(rewritten);
    sync(enabled, rewritten, rateText);
  };

  useEditorHandlingClose(ref);

  return (
    <Editor type="edit" title={t('sos_section')}>
      <PaddedInputContainer size="m">
        <InputWithTopLabelContainer>
          <ToggleLine>
            <SectionLabel>{t('sos_enabled')}</SectionLabel>
            <Toggle checked={enabled} onChange={(e) => onEnabledChange(e.target.checked)} />
          </ToggleLine>
          <Hint>{t('sos_enabled_hint')}</Hint>
        </InputWithTopLabelContainer>

        <Section $muted={!enabled}>
          <InputWithTopLabelContainer>
            <Label>{t('sos_call_rate')}</Label>
            <Hint>{t('sos_call_rate_hint')}</Hint>
            <RateField>
              <Input
                type="number"
                min="0"
                step="1"
                placeholder={t('sos_call_rate_placeholder')}
                value={rateText}
                onChange={(e) => onRateChange(e.target.value)}
              />
            </RateField>
          </InputWithTopLabelContainer>

          <InputWithTopLabelContainer>
            <ToggleLine>
              <Label>{t('sos_pick_randomly')}</Label>
              <Toggle checked={!weighted} onChange={(e) => onWeightedChange(!e.target.checked)} />
            </ToggleLine>
          </InputWithTopLabelContainer>

          <InputWithTopLabelContainer>
            <SectionLabel>{t('sos_allies')}</SectionLabel>
            <Hint>{t('sos_allies_hint')}</Hint>
          </InputWithTopLabelContainer>

          <SosAllyTable allies={allies} weighted={weighted} onChange={onAlliesChange} />
        </Section>
      </PaddedInputContainer>
    </Editor>
  );
});
SosEditor.displayName = 'SosEditor';
