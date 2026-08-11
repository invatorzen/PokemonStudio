import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';

import { PageEditor } from '@components/pages';
import { Input, InputWithLeftLabelContainer, Label, Toggle } from '@components/inputs';
import { DeleteButtonOnlyIcon } from '@components/buttons';
import PlusIcon from '@assets/icons/global/plus-icon.svg';

import { useSosConfig } from './sosConfigStore';
import { effectiveSosSettings, SOS_ANSWER_FLAGS, type SosSettings } from './types';

const Hint = styled.p`
  ${({ theme }) => theme.fonts.normalSmall};
  color: ${({ theme }) => theme.colors.text400};
  margin: -4px 0 4px;
`;

const NarrowInput = styled(Input)`
  width: 96px;
`;

const TableWrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const HeadRow = styled.div<{ $cols: string }>`
  display: grid;
  grid-template-columns: ${({ $cols }) => $cols};
  gap: 8px;
  align-items: center;
  ${({ theme }) => theme.fonts.normalSmall};
  color: ${({ theme }) => theme.colors.text400};
  padding: 0 4px;
`;

const BodyRow = styled.div<{ $cols: string }>`
  display: grid;
  grid-template-columns: ${({ $cols }) => $cols};
  gap: 8px;
  align-items: center;

  & input {
    width: 100%;
  }
`;

const AddButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 8px;
  border-radius: 8px;
  border: 1px dashed ${({ theme }) => theme.colors.dark24};
  background-color: transparent;
  color: ${({ theme }) => theme.colors.text400};
  ${({ theme }) => theme.fonts.normalMedium};
  cursor: pointer;
  transition: border-color 120ms ease, color 120ms ease, background-color 120ms ease;

  & svg {
    width: 12px;
    height: 12px;
  }
  & svg path {
    fill: currentColor;
  }

  &:hover {
    border-color: ${({ theme }) => theme.colors.primaryBase};
    color: ${({ theme }) => theme.colors.primaryBase};
    background-color: ${({ theme }) => theme.colors.primarySoft}18;
  }
`;

type NumberFieldProps = {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number | 'any';
  integer?: boolean;
  narrow?: boolean;
};

/**
 * A number input that keeps its own raw text while focused, so clearing it mid-
 * edit doesn't snap to a default. Only finite parses are pushed up; the value is
 * floored at `min` when given. Mirrors the SosRateInput pattern.
 */
const NumberField = ({ value, onChange, min, max, step, integer, narrow }: NumberFieldProps) => {
  // While focused, show the raw text so clearing mid-edit doesn't snap back;
  // when not focused, always mirror the external value. Derived, so no effect.
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  const display = focused ? text : String(value);

  const commit = (raw: string) => {
    const n = integer ? parseInt(raw, 10) : parseFloat(raw);
    if (!Number.isFinite(n)) return;
    let v = n;
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    onChange(v);
  };

  const Component = narrow ? NarrowInput : Input;
  return (
    <Component
      type="number"
      min={min}
      max={max}
      step={step ?? (integer ? 1 : 'any')}
      value={display}
      onFocus={() => {
        setText(String(value));
        setFocused(true);
      }}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        setText(e.target.value);
        commit(e.target.value);
      }}
    />
  );
};

/**
 * The global SOS Battles settings editor, shown on the project dashboard. Reads
 * and writes the `settings` block of sos_battles.json through the SOS config
 * store, which parks edits for the bottom-left "Save data" button — no auto-save
 * and no save button of its own. Values fall back to the plugin defaults so the
 * page is always complete even before the file has a settings block.
 */
export const SosSettingsPanel = () => {
  const { t } = useTranslation();
  const { settings, setSettings, status } = useSosConfig();
  const s = effectiveSosSettings(settings);

  // Hold off until the file has been read, so an edit can't land on defaults
  // before the real settings arrive (and then overwrite them on the next park).
  if (status === 'loading' || status === 'idle') {
    return (
      <PageEditor editorTitle={t('sos_section')} title={t('sos_settings_general')}>
        <Hint>{t('sos_settings_loading')}</Hint>
      </PageEditor>
    );
  }

  // Every edit writes the whole effective block, so the file always holds a
  // complete, valid settings object regardless of which keys it started with.
  const update = (partial: Partial<SosSettings>) => setSettings({ ...s, ...partial });

  return (
    <>
      <PageEditor editorTitle={t('sos_section')} title={t('sos_settings_general')}>
        <InputWithLeftLabelContainer>
          <Label>{t('sos_set_base_call_rate')}</Label>
          <NumberField value={s.base_call_rate} min={0} integer narrow onChange={(v) => update({ base_call_rate: v })} />
        </InputWithLeftLabelContainer>
        <InputWithLeftLabelContainer>
          <Label>{t('sos_set_answer_rate_factor')}</Label>
          <NumberField value={s.answer_rate_factor} min={0} narrow onChange={(v) => update({ answer_rate_factor: v })} />
        </InputWithLeftLabelContainer>
        <InputWithLeftLabelContainer>
          <Label>{t('sos_set_grace_turns')}</Label>
          <NumberField value={s.grace_turns} min={0} integer narrow onChange={(v) => update({ grace_turns: v })} />
        </InputWithLeftLabelContainer>
        <InputWithLeftLabelContainer>
          <Label>{t('sos_set_adrenaline_orb_multiplier')}</Label>
          <NumberField value={s.adrenaline_orb_multiplier} min={0} narrow onChange={(v) => update({ adrenaline_orb_multiplier: v })} />
        </InputWithLeftLabelContainer>
        <InputWithLeftLabelContainer>
          <Label>{t('sos_set_trainer_distress_percent')}</Label>
          <NumberField value={s.trainer_distress_percent} min={0} max={100} integer narrow onChange={(v) => update({ trainer_distress_percent: v })} />
        </InputWithLeftLabelContainer>
      </PageEditor>

      <PageEditor editorTitle={t('sos_section')} title={t('sos_settings_family')}>
        <InputWithLeftLabelContainer>
          <Label>{t('sos_set_family_branch_rate')}</Label>
          <NumberField value={s.family_branch_rate} min={0} max={100} integer narrow onChange={(v) => update({ family_branch_rate: v })} />
        </InputWithLeftLabelContainer>
        <InputWithLeftLabelContainer>
          <Label>{t('sos_set_group_fallback_rate')}</Label>
          <NumberField value={s.group_fallback_rate} min={0} max={100} integer narrow onChange={(v) => update({ group_fallback_rate: v })} />
        </InputWithLeftLabelContainer>
        <InputWithLeftLabelContainer>
          <Label>{t('sos_set_family_branch_allows_evolution')}</Label>
          <Toggle
            checked={s.family_branch_allows_evolution}
            onChange={(e) => update({ family_branch_allows_evolution: e.target.checked })}
          />
        </InputWithLeftLabelContainer>
      </PageEditor>

      <PageEditor editorTitle={t('sos_section')} title={t('sos_settings_hp')}>
        <Hint>{t('sos_settings_hp_hint')}</Hint>
        <TableWrap>
          <HeadRow $cols="1fr 1fr 32px">
            <span>{t('sos_set_hp_ratio')}</span>
            <span>{t('sos_set_hp_multiplier')}</span>
            <span />
          </HeadRow>
          {s.hp_multipliers.map((row, i) => (
            <BodyRow key={i} $cols="1fr 1fr 32px">
              <NumberField
                value={row[0]}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) => update({ hp_multipliers: s.hp_multipliers.map((r, j) => (j === i ? [v, r[1]] : r)) })}
              />
              <NumberField
                value={row[1]}
                min={0}
                step={0.1}
                onChange={(v) => update({ hp_multipliers: s.hp_multipliers.map((r, j) => (j === i ? [r[0], v] : r)) })}
              />
              <DeleteButtonOnlyIcon size="s" onClick={() => update({ hp_multipliers: s.hp_multipliers.filter((_, j) => j !== i) })} />
            </BodyRow>
          ))}
          <AddButton type="button" onClick={() => update({ hp_multipliers: [...s.hp_multipliers, [0.5, 2]] })}>
            <PlusIcon />
            {t('sos_set_add_row')}
          </AddButton>
        </TableWrap>
      </PageEditor>

      <PageEditor editorTitle={t('sos_section')} title={t('sos_settings_answer')}>
        <Hint>{t('sos_settings_answer_hint')}</Hint>
        {SOS_ANSWER_FLAGS.map((flag) => (
          <InputWithLeftLabelContainer key={flag}>
            <Label>{t(`sos_set_answer_${flag}`)}</Label>
            <NumberField
              value={s.answer_multipliers[flag]}
              min={0}
              step={0.1}
              narrow
              onChange={(v) => update({ answer_multipliers: { ...s.answer_multipliers, [flag]: v } })}
            />
          </InputWithLeftLabelContainer>
        ))}
      </PageEditor>

      <PageEditor editorTitle={t('sos_section')} title={t('sos_settings_chain')}>
        <Hint>{t('sos_settings_chain_hint')}</Hint>
        <InputWithLeftLabelContainer>
          <Label>{t('sos_set_chain_shiny_multiplier')}</Label>
          <NumberField value={s.chain_shiny_multiplier} min={0} integer narrow onChange={(v) => update({ chain_shiny_multiplier: v })} />
        </InputWithLeftLabelContainer>
        <TableWrap>
          <HeadRow $cols="1fr 1fr 1fr 1fr 32px">
            <span>{t('sos_set_chain_at')}</span>
            <span>{t('sos_set_chain_ivs')}</span>
            <span>{t('sos_set_chain_ha')}</span>
            <span>{t('sos_set_chain_shiny')}</span>
            <span />
          </HeadRow>
          {s.chain_thresholds.map((row, i) => (
            <BodyRow key={i} $cols="1fr 1fr 1fr 1fr 32px">
              {[0, 1, 2, 3].map((col) => (
                <NumberField
                  key={col}
                  value={row[col]}
                  min={0}
                  integer
                  onChange={(v) =>
                    update({
                      chain_thresholds: s.chain_thresholds.map((r, j) =>
                        j === i ? (r.map((c, k) => (k === col ? v : c)) as [number, number, number, number]) : r
                      ),
                    })
                  }
                />
              ))}
              <DeleteButtonOnlyIcon size="s" onClick={() => update({ chain_thresholds: s.chain_thresholds.filter((_, j) => j !== i) })} />
            </BodyRow>
          ))}
          <AddButton type="button" onClick={() => update({ chain_thresholds: [...s.chain_thresholds, [0, 0, 0, 0]] })}>
            <PlusIcon />
            {t('sos_set_add_row')}
          </AddButton>
        </TableWrap>
      </PageEditor>
    </>
  );
};
