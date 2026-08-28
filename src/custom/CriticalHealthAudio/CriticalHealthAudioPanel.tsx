import React from 'react';
import { useTranslation } from 'react-i18next';

import { PageEditor } from '@components/pages';
import { InputWithLeftLabelContainer, InputWithTopLabelContainer, Label } from '@components/inputs';
import { SelectCustomSimple } from '@components/SelectCustom/SelectCustomSimple';

import { useCriticalHealthAudioConfig } from './criticalHealthAudioConfigStore';
import { ActiveBadge, Hint, NumberField, PathField } from './criticalHealthAudioUi';

/**
 * The Critical Health Audio settings, shown on the project dashboard. Reads and
 * writes the whole plugin config through the shared store, which parks edits for
 * the bottom-left "Save data" button — no auto-save and no button of its own.
 * Falls back to the plugin defaults so the page is always complete even before
 * the file exists.
 *
 * Both behavior sections are always shown (both are persisted); the mode selector
 * only picks which one the game uses, flagged with an "active" badge.
 */
export const CriticalHealthAudioPanel = () => {
  const { t } = useTranslation();
  const { status, error, config, setMode, setSoundEffect, setBgmReplacement } = useCriticalHealthAudioConfig();

  if (status === 'loading' || status === 'idle') {
    return (
      <PageEditor editorTitle={t('cha_section')} title={t('cha_mode_title')}>
        <Hint>{t('cha_loading')}</Hint>
      </PageEditor>
    );
  }
  if (status === 'error') {
    return (
      <PageEditor editorTitle={t('cha_section')} title={t('cha_mode_title')}>
        <Hint>{t('cha_load_error', { error: error ?? '' })}</Hint>
      </PageEditor>
    );
  }

  // Built inside the component so the labels are translated (SelectCustomSimple
  // renders option.label verbatim).
  const modeOptions = [
    { value: 'sound_effect', label: t('cha_mode_sound_effect') },
    { value: 'bgm_replacement', label: t('cha_mode_bgm_replacement') },
  ];

  const se = config.sound_effect_mode;
  const bgm = config.bgm_replacement_mode;

  return (
    <>
      <PageEditor editorTitle={t('cha_section')} title={t('cha_mode_title')} canCollapse>
        <Hint>{t('cha_mode_hint')}</Hint>
        <InputWithTopLabelContainer>
          <Label htmlFor="cha-mode">{t('cha_mode_label')}</Label>
          <SelectCustomSimple id="cha-mode" value={config.mode} options={modeOptions} onChange={(value) => setMode(value as typeof config.mode)} />
        </InputWithTopLabelContainer>
      </PageEditor>

      <PageEditor editorTitle={t('cha_section')} title={t('cha_se_title')} canCollapse>
        {config.mode === 'sound_effect' && <ActiveBadge>{t('cha_active')}</ActiveBadge>}
        <Hint>{t('cha_se_hint')}</Hint>
        <InputWithTopLabelContainer>
          <Label htmlFor="cha-se-filename">{t('cha_se_filename')}</Label>
          <Hint>{t('cha_se_filename_hint')}</Hint>
          <PathField value={se.filename} placeholder="audio/se/low_health" onChange={(v) => setSoundEffect({ filename: v })} />
        </InputWithTopLabelContainer>
        <InputWithLeftLabelContainer>
          <Label>{t('cha_volume')}</Label>
          <NumberField value={se.volume} min={0} max={100} integer narrow onChange={(v) => setSoundEffect({ volume: v })} />
        </InputWithLeftLabelContainer>
        <InputWithLeftLabelContainer>
          <Label>{t('cha_bgm_reduction')}</Label>
          <NumberField
            value={se.bgm_volume_reduction_percent}
            min={0}
            max={100}
            integer
            narrow
            onChange={(v) => setSoundEffect({ bgm_volume_reduction_percent: v })}
          />
        </InputWithLeftLabelContainer>
      </PageEditor>

      <PageEditor editorTitle={t('cha_section')} title={t('cha_bgm_title')} canCollapse>
        {config.mode === 'bgm_replacement' && <ActiveBadge>{t('cha_active')}</ActiveBadge>}
        <Hint>{t('cha_bgm_hint')}</Hint>
        <InputWithTopLabelContainer>
          <Label htmlFor="cha-bgm-filename">{t('cha_bgm_filename')}</Label>
          <Hint>{t('cha_bgm_filename_hint')}</Hint>
          <PathField value={bgm.filename} placeholder="audio/bgm/battle_low_hp" onChange={(v) => setBgmReplacement({ filename: v })} />
        </InputWithTopLabelContainer>
        <InputWithLeftLabelContainer>
          <Label>{t('cha_volume')}</Label>
          <NumberField value={bgm.volume} min={0} max={100} integer narrow onChange={(v) => setBgmReplacement({ volume: v })} />
        </InputWithLeftLabelContainer>
        <InputWithLeftLabelContainer>
          <Label>{t('cha_fade_in')}</Label>
          <NumberField value={bgm.fade_in_ms} min={0} integer narrow onChange={(v) => setBgmReplacement({ fade_in_ms: v })} />
        </InputWithLeftLabelContainer>
        <InputWithLeftLabelContainer>
          <Label>{t('cha_restore_fade_in')}</Label>
          <NumberField value={bgm.restore_fade_in_ms} min={0} integer narrow onChange={(v) => setBgmReplacement({ restore_fade_in_ms: v })} />
        </InputWithLeftLabelContainer>
      </PageEditor>
    </>
  );
};
