import React from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { PageEditor, PageTemplate } from '@components/pages';
import { Label, RadioInput } from '@components/inputs';
import { useThemeMode } from '@hooks/useThemeMode';
import type { ThemeMode } from '@src/AppTheme';

const ThemeListContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  user-select: none;
`;

const ThemeOptionContainer = styled.div`
  display: flex;
  flex-direction: row;
  gap: 16px;
  align-items: center;
  padding: 4px 4px 4px 8px;
  border-radius: 8px;
  height: 40px;

  :hover,
  *:hover {
    background-color: ${({ theme }) => theme.colors.dark19};
    cursor: pointer;
  }

  &[data-checked='true'] {
    background-color: ${({ theme }) => theme.colors.dark19};

    .theme-label {
      color: ${({ theme }) => theme.colors.text100};
    }
  }

  .theme-label {
    color: ${({ theme }) => theme.colors.text400};
  }
`;

const THEME_OPTIONS: ThemeMode[] = ['dark', 'light'];

export const SettingsThemePage = () => {
  const { t } = useTranslation();
  const { mode, setMode } = useThemeMode();

  return (
    <PageTemplate title={t('theme')} size="default">
      <PageEditor title={t('theme_choice')} editorTitle={t('theme')}>
        <ThemeListContainer>
          {THEME_OPTIONS.map((option) => (
            <ThemeOptionContainer key={option} data-checked={mode === option} onClick={() => setMode(option)}>
              <RadioInput checked={mode === option} onChange={() => setMode(option)} />
              <Label className="theme-label">{t(`${option}_theme`)}</Label>
            </ThemeOptionContainer>
          ))}
        </ThemeListContainer>
      </PageEditor>
    </PageTemplate>
  );
};
