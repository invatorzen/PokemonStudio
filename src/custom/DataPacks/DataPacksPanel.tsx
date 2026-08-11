import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';

import { PageEditor } from '@components/pages';
import { InputWithLeftLabelContainer, Label, Toggle } from '@components/inputs';
import { useGlobalState } from '@src/GlobalStateProvider';
import type { ApplyDataPackInput, ApplyDataPackOutput, CheckDataPackEnvOutput } from '@src/backendTasks/applyDataPack';

import {
  DATA_PACK_CATEGORIES,
  DATA_PACK_GENERATIONS,
  DATA_PACK_GENS,
  type DataPackSourceMode,
  type DataPackStrategy,
} from './types';

// --- backend promise wrappers -----------------------------------------------

const applyDataPack = (input: ApplyDataPackInput): Promise<ApplyDataPackOutput> =>
  new Promise((resolve, reject) => window.api.applyDataPack(input, resolve, ({ errorMessage }) => reject(new Error(errorMessage))));

const checkDataPackEnv = (): Promise<CheckDataPackEnvOutput> =>
  new Promise((resolve, reject) => window.api.checkDataPackEnv({}, resolve, ({ errorMessage }) => reject(new Error(errorMessage))));

const chooseFolder = (): Promise<string> =>
  new Promise((resolve, reject) => window.api.chooseFolder({}, ({ folderPath }) => resolve(folderPath), ({ errorMessage }) => reject(new Error(errorMessage))));

// --- styling ----------------------------------------------------------------

const Hint = styled.p`
  ${({ theme }) => theme.fonts.normalSmall};
  color: ${({ theme }) => theme.colors.text400};
  margin: -4px 0 4px;
`;

const Select = styled.select`
  ${({ theme }) => theme.fonts.normalMedium};
  color: ${({ theme }) => theme.colors.text100};
  background-color: ${({ theme }) => theme.colors.dark18};
  border: 1px solid ${({ theme }) => theme.colors.dark24};
  border-radius: 8px;
  padding: 8px 10px;
  min-width: 220px;
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
`;

const PathBox = styled.span`
  ${({ theme }) => theme.fonts.normalSmall};
  color: ${({ theme }) => theme.colors.text400};
  word-break: break-all;
`;

const Warn = styled.p<{ $danger?: boolean }>`
  ${({ theme }) => theme.fonts.normalSmall};
  color: ${({ theme, $danger }) => ($danger ? theme.colors.dangerBase : theme.colors.warningBase)};
  margin: 4px 0;
`;

const Button = styled.button<{ $variant?: 'primary' | 'danger' | 'secondary' }>`
  ${({ theme }) => theme.fonts.normalMedium};
  padding: 10px 16px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.text100};
  background-color: ${({ theme, $variant }) =>
    $variant === 'danger' ? theme.colors.dangerBase : $variant === 'secondary' ? theme.colors.dark20 : theme.colors.primaryBase};
  transition: filter 120ms ease;

  &:hover:not(:disabled) {
    filter: brightness(1.1);
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const LogView = styled.pre`
  ${({ theme }) => theme.fonts.codeRegular};
  color: ${({ theme }) => theme.colors.text100};
  background-color: ${({ theme }) => theme.colors.dark12};
  border: 1px solid ${({ theme }) => theme.colors.dark20};
  border-radius: 8px;
  padding: 12px;
  max-height: 320px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
`;

const CheckRow = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  ${({ theme }) => theme.fonts.normalMedium};
  color: ${({ theme }) => theme.colors.text100};
  cursor: pointer;
`;

type Phase = 'config' | 'previewing' | 'applying' | 'done';

/**
 * The Data Packs installer wizard. Collects source/strategy/target/scope, runs
 * the bundled Ruby installer in dry-run to preview, then applies it after an
 * explicit confirmation. The script owns the actual work (and its own backups);
 * this panel just drives it and shows its output. No auto-run.
 */
export const DataPacksPanel = () => {
  const { t } = useTranslation();
  const [{ projectPath }] = useGlobalState();

  const [env, setEnv] = useState<CheckDataPackEnvOutput | null>(null);
  const [sourceMode, setSourceMode] = useState<DataPackSourceMode>('local');
  const [localPath, setLocalPath] = useState('');
  const [strategy, setStrategy] = useState<DataPackStrategy>('overwrite');
  const [gen, setGen] = useState(9);
  const [version, setVersion] = useState(DATA_PACK_GENERATIONS[9][0]);
  const [fromGen, setFromGen] = useState(9);
  const [fromVersion, setFromVersion] = useState(DATA_PACK_GENERATIONS[9][0]);
  const [scopeAll, setScopeAll] = useState(true);
  const [categories, setCategories] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);

  const [phase, setPhase] = useState<Phase>('config');
  const [previewLog, setPreviewLog] = useState('');
  const [applyLog, setApplyLog] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    checkDataPackEnv()
      .then(setEnv)
      .catch(() => setEnv({ ruby: false, git: false }));
  }, []);

  // Keep each version valid for its generation.
  useEffect(() => {
    if (!DATA_PACK_GENERATIONS[gen].includes(version)) setVersion(DATA_PACK_GENERATIONS[gen][0]);
  }, [gen, version]);
  useEffect(() => {
    if (!DATA_PACK_GENERATIONS[fromGen].includes(fromVersion)) setFromVersion(DATA_PACK_GENERATIONS[fromGen][0]);
  }, [fromGen, fromVersion]);

  const scope = useMemo(() => (scopeAll || categories.length === 0 ? ['all'] : categories), [scopeAll, categories]);

  const sameSwitchPacks = strategy === 'switch' && fromGen === gen && fromVersion === version;
  const remoteNeedsGit = sourceMode === 'remote' && env !== null && !env.git;
  const localNeedsPath = sourceMode === 'local' && localPath.trim() === '';
  const canRun = !!projectPath && phase !== 'previewing' && phase !== 'applying' && !sameSwitchPacks && !remoteNeedsGit && !localNeedsPath;

  const buildInput = (dryRun: boolean): ApplyDataPackInput => ({
    projectPath: projectPath ?? '',
    strategy,
    gen,
    version,
    fromGen: strategy === 'switch' ? fromGen : undefined,
    fromVersion: strategy === 'switch' ? fromVersion : undefined,
    scope,
    source: sourceMode === 'local' ? { mode: 'local', path: localPath.trim() } : { mode: 'remote' },
    dryRun,
  });

  const runPreview = async () => {
    setError('');
    setApplyLog('');
    setPreviewLog('');
    setPhase('previewing');
    try {
      const { log } = await applyDataPack(buildInput(true));
      setPreviewLog(log);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPhase('config');
    }
  };

  const runApply = async () => {
    setError('');
    setApplyLog('');
    setPhase('applying');
    try {
      const { exitCode, log } = await applyDataPack(buildInput(false));
      setApplyLog(log);
      if (exitCode === 0) setPhase('done');
      else {
        setError(t('dp_apply_failed', { code: exitCode ?? '?' }));
        setPhase('config');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('config');
    }
  };

  const busy = phase === 'previewing' || phase === 'applying';

  return (
    <>
      <PageEditor editorTitle={t('dp_title')} title={t('dp_requirements')}>
        <Hint>{t('dp_intro')}</Hint>
        {env && !env.ruby && <Warn $danger>{t('dp_no_ruby')}</Warn>}
        {remoteNeedsGit && <Warn $danger>{t('dp_no_git')}</Warn>}
        {!projectPath && <Warn $danger>{t('dp_no_project')}</Warn>}
        <Warn>{t('dp_close_editors')}</Warn>
      </PageEditor>

      <PageEditor editorTitle={t('dp_title')} title={t('dp_source')}>
        <InputWithLeftLabelContainer>
          <Label>{t('dp_source_mode')}</Label>
          <Select value={sourceMode} onChange={(e) => setSourceMode(e.target.value as DataPackSourceMode)}>
            <option value="local">{t('dp_source_local')}</option>
            <option value="remote">{t('dp_source_remote')}</option>
          </Select>
        </InputWithLeftLabelContainer>
        {sourceMode === 'local' ? (
          <Row>
            <Button $variant="secondary" onClick={() => chooseFolder().then(setLocalPath).catch(() => undefined)}>
              {t('dp_pick_folder')}
            </Button>
            <PathBox>{localPath || t('dp_no_folder')}</PathBox>
          </Row>
        ) : (
          <Hint>{t('dp_remote_hint')}</Hint>
        )}
      </PageEditor>

      <PageEditor editorTitle={t('dp_title')} title={t('dp_strategy')}>
        <InputWithLeftLabelContainer>
          <Label>{t('dp_strategy')}</Label>
          <Select value={strategy} onChange={(e) => setStrategy(e.target.value as DataPackStrategy)}>
            <option value="overwrite">{t('dp_strategy_overwrite')}</option>
            <option value="switch">{t('dp_strategy_switch')}</option>
          </Select>
        </InputWithLeftLabelContainer>
        <Hint>{strategy === 'overwrite' ? t('dp_strategy_overwrite_hint') : t('dp_strategy_switch_hint')}</Hint>

        {strategy === 'switch' && (
          <InputWithLeftLabelContainer>
            <Label>{t('dp_from')}</Label>
            <Row>
              <Select value={fromGen} onChange={(e) => setFromGen(Number(e.target.value))}>
                {DATA_PACK_GENS.map((g) => (
                  <option key={g} value={g}>{t('dp_gen_n', { n: g })}</option>
                ))}
              </Select>
              <Select value={fromVersion} onChange={(e) => setFromVersion(e.target.value)}>
                {DATA_PACK_GENERATIONS[fromGen].map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </Select>
            </Row>
          </InputWithLeftLabelContainer>
        )}

        <InputWithLeftLabelContainer>
          <Label>{t('dp_to')}</Label>
          <Row>
            <Select value={gen} onChange={(e) => setGen(Number(e.target.value))}>
              {DATA_PACK_GENS.map((g) => (
                <option key={g} value={g}>{t('dp_gen_n', { n: g })}</option>
              ))}
            </Select>
            <Select value={version} onChange={(e) => setVersion(e.target.value)}>
              {DATA_PACK_GENERATIONS[gen].map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </Select>
          </Row>
        </InputWithLeftLabelContainer>
        {sameSwitchPacks && <Warn $danger>{t('dp_same_packs')}</Warn>}
      </PageEditor>

      <PageEditor editorTitle={t('dp_title')} title={t('dp_scope')}>
        <InputWithLeftLabelContainer>
          <Label>{t('dp_scope_all')}</Label>
          <Toggle checked={scopeAll} onChange={(e) => setScopeAll(e.target.checked)} />
        </InputWithLeftLabelContainer>
        {!scopeAll && (
          <Row>
            {DATA_PACK_CATEGORIES.map((cat) => (
              <CheckRow key={cat}>
                <Toggle
                  checked={categories.includes(cat)}
                  onChange={(e) => setCategories(e.target.checked ? [...categories, cat] : categories.filter((c) => c !== cat))}
                />
                {t(`dp_cat_${cat}`)}
              </CheckRow>
            ))}
          </Row>
        )}
      </PageEditor>

      <PageEditor editorTitle={t('dp_title')} title={t('dp_apply')}>
        <Row>
          <Button $variant="secondary" disabled={!canRun} onClick={runPreview}>
            {phase === 'previewing' ? t('dp_previewing') : t('dp_preview')}
          </Button>
        </Row>
        {previewLog && <LogView>{previewLog}</LogView>}

        <Warn $danger>{t('dp_apply_warning')}</Warn>
        <CheckRow>
          <Toggle checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          {t('dp_confirm')}
        </CheckRow>
        <Row>
          <Button $variant="danger" disabled={!canRun || !confirmed} onClick={runApply}>
            {phase === 'applying' ? t('dp_applying') : t('dp_apply_button')}
          </Button>
        </Row>

        {error && <Warn $danger>{error}</Warn>}
        {phase === 'done' && <Warn>{t('dp_done')}</Warn>}
        {applyLog && <LogView>{applyLog}</LogView>}
      </PageEditor>
      {busy && <Hint>{t('dp_running')}</Hint>}
    </>
  );
};
