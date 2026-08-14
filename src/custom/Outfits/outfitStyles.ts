import styled from 'styled-components';

/** Muted helper/hint line shared by the Outfits tabs. */
export const HelpText = styled.span`
  ${({ theme }) => theme.fonts.normalSmall};
  color: ${({ theme }) => theme.colors.text400};
  display: block;
  margin-top: 4px;
`;

/** Muted status line (no project / loading / empty / error). */
export const EmptyState = styled.span`
  ${({ theme }) => theme.fonts.normalMedium};
  color: ${({ theme }) => theme.colors.text400};
`;
