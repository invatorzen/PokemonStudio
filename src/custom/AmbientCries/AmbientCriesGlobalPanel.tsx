import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';

import { PageEditor } from '@components/pages';
import { Input, InputWithLeftLabelContainer, InputWithTopLabelContainer, Label } from '@components/inputs';
import PlusIcon from '@assets/icons/global/plus-icon.svg';

import { useAmbientCriesConfig } from './ambientCriesConfigStore';
import { AddButton, Hint, NumberField, PairRow } from './ambientCriesUi';

const TagArea = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const ChipRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const Chip = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px 4px 12px;
  border-radius: 16px;
  background-color: ${({ theme }) => theme.colors.dark20};
  color: ${({ theme }) => theme.colors.text100};
  ${({ theme }) => theme.fonts.normalMedium};

  & button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    padding: 0;
    border: none;
    border-radius: 100%;
    background-color: transparent;
    color: ${({ theme }) => theme.colors.text400};
    cursor: pointer;
    ${({ theme }) => theme.fonts.normalMedium};

    &:hover {
      color: ${({ theme }) => theme.colors.dangerBase};
    }
  }
`;

const AddTagRow = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;

  & input {
    flex: 1;
  }
`;

const AddTagButton = styled(AddButton)`
  width: auto;
  padding: 8px 16px;
  white-space: nowrap;
`;

type TagListProps = {
  tags: string[];
  onChange: (tags: string[]) => void;
};

/**
 * A minimal add/remove chip list of raw system-tag strings. The config stores
 * the plugin's own snake_case tag names (e.g. `grass`, `tall_grass`, `sea`),
 * which are a different vocabulary from Studio's CamelCase group system tags, so
 * a free-text chip list is the honest surface here rather than a mismatched
 * SelectSystemTag.
 */
const TagList = ({ tags, onChange }: TagListProps) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');

  const add = () => {
    const value = draft.trim();
    if (!value || tags.includes(value)) {
      setDraft('');
      return;
    }
    onChange([...tags, value]);
    setDraft('');
  };

  return (
    <TagArea>
      {tags.length > 0 && (
        <ChipRow>
          {tags.map((tag) => (
            <Chip key={tag}>
              {tag}
              <button type="button" aria-label={t('ac_tag_remove')} onClick={() => onChange(tags.filter((v) => v !== tag))}>
                ×
              </button>
            </Chip>
          ))}
        </ChipRow>
      )}
      <AddTagRow>
        <Input
          value={draft}
          placeholder={t('ac_tag_placeholder')}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <AddTagButton type="button" onClick={add}>
          <PlusIcon />
          {t('ac_tag_add')}
        </AddTagButton>
      </AddTagRow>
    </TagArea>
  );
};

/**
 * The global Ambient Cries settings, shown on the project dashboard. Reads and
 * writes the top-level (non-zone) fields of ambient_cries_config.json through the
 * shared store, which parks edits for the bottom-left "Save data" button — no
 * auto-save and no button of its own. Falls back to the plugin defaults so the
 * page is always complete even before the file exists.
 */
export const AmbientCriesGlobalPanel = () => {
  const { t } = useTranslation();
  const { status, error, config, setGlobal } = useAmbientCriesConfig();

  if (status === 'loading' || status === 'idle') {
    return (
      <PageEditor editorTitle={t('ac_section')} title={t('ac_settings_general')}>
        <Hint>{t('ac_loading')}</Hint>
      </PageEditor>
    );
  }
  if (status === 'error') {
    return (
      <PageEditor editorTitle={t('ac_section')} title={t('ac_settings_general')}>
        <Hint>{t('ac_load_error', { error: error ?? '' })}</Hint>
      </PageEditor>
    );
  }

  const [intMin, intMax] = config.roll_interval_seconds;
  const [volMin, volMax] = config.volume;

  return (
    <>
      <PageEditor editorTitle={t('ac_section')} title={t('ac_settings_general')} canCollapse>
        <Hint>{t('ac_settings_general_hint')}</Hint>
        <InputWithLeftLabelContainer>
          <Label>{t('ac_roll_chance')}</Label>
          <NumberField value={config.roll_chance_percent} min={0} max={100} narrow onChange={(v) => setGlobal({ roll_chance_percent: v })} />
        </InputWithLeftLabelContainer>
        <InputWithTopLabelContainer>
          <Label>{t('ac_roll_interval')}</Label>
          <Hint>{t('ac_roll_interval_hint')}</Hint>
          <PairRow>
            <NumberField
              value={intMin}
              min={0}
              integer
              narrow
              onChange={(v) => setGlobal({ roll_interval_seconds: [v, intMax] })}
            />
            <span className="sep">{t('ac_range_to')}</span>
            <NumberField
              value={intMax}
              min={0}
              integer
              narrow
              onChange={(v) => setGlobal({ roll_interval_seconds: [intMin, v] })}
            />
          </PairRow>
        </InputWithTopLabelContainer>
        <InputWithTopLabelContainer>
          <Label>{t('ac_volume')}</Label>
          <Hint>{t('ac_volume_hint')}</Hint>
          <PairRow>
            <NumberField value={volMin} min={0} max={100} integer narrow onChange={(v) => setGlobal({ volume: [v, volMax] })} />
            <span className="sep">{t('ac_range_to')}</span>
            <NumberField value={volMax} min={0} max={100} integer narrow onChange={(v) => setGlobal({ volume: [volMin, v] })} />
          </PairRow>
        </InputWithTopLabelContainer>
      </PageEditor>

      <PageEditor editorTitle={t('ac_section')} title={t('ac_settings_tags')} canCollapse>
        <Hint>{t('ac_settings_tags_hint')}</Hint>
        <InputWithTopLabelContainer>
          <Label>{t('ac_ground_tags')}</Label>
          <TagList tags={config.ground_system_tags} onChange={(tags) => setGlobal({ ground_system_tags: tags })} />
        </InputWithTopLabelContainer>
        <InputWithTopLabelContainer>
          <Label>{t('ac_water_tags')}</Label>
          <TagList tags={config.water_system_tags} onChange={(tags) => setGlobal({ water_system_tags: tags })} />
        </InputWithTopLabelContainer>
      </PageEditor>
    </>
  );
};
