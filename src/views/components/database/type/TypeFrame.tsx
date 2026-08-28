import { TypeCategory } from '@components/categories';
import { TypeCategoryIcon } from '@components/categories/TypeCategoryIcon';
import React from 'react';
import styled from 'styled-components';
import {
  DataBlockContainer,
  DataGrid,
  DataInfoContainer,
  DataInfoContainerHeader,
  DataInfoContainerHeaderBadges,
  DataInfoContainerHeaderTitle,
} from '../dataBlocks';
import { CopyIdentifier, CopyStyle } from '@components/Copy';
import { useTypePage } from '@hooks/usePage';
import { TypeDialogsRef } from './editors/TypeEditorOverlay';

// Two hover-only reflows this block otherwise has:
//  - ActiveContainer's hover/active highlight is a 2px outline drawn OUTSIDE the
//    box, making it look ~2px taller. Draw it inside so the footprint is stable.
//  - The copy identifier is display:none until hover, so revealing it pushes the
//    title row down. Keep it laid out at all times (visibility, not display) so
//    the row height never changes.
const TypeFrameContainer = styled(DataBlockContainer)`
  &:hover,
  &:active,
  &.active {
    outline-offset: -2px;
  }

  ${CopyStyle} {
    display: inline-block;
    visibility: hidden;
  }

  &:hover ${CopyStyle} {
    visibility: visible;
  }
`;

export const TypeFrame = ({ dialogsRef }: { dialogsRef: TypeDialogsRef }) => {
  const { currentTypeName, typeDbSymbol } = useTypePage();
  return (
    <TypeFrameContainer size="full" onClick={() => dialogsRef?.current?.openDialog('frame')}>
      <DataGrid columns="minmax(min-content, 692px) auto">
        <DataInfoContainer>
          <DataInfoContainerHeader>
            <DataInfoContainerHeaderTitle>
              <h1>{currentTypeName}</h1>
              <CopyIdentifier dataToCopy={typeDbSymbol} />
            </DataInfoContainerHeaderTitle>
            <DataInfoContainerHeaderBadges>
              <TypeCategory type={typeDbSymbol}>{currentTypeName}</TypeCategory>
              <TypeCategoryIcon type={typeDbSymbol}></TypeCategoryIcon>
            </DataInfoContainerHeaderBadges>
          </DataInfoContainerHeader>
        </DataInfoContainer>
      </DataGrid>
    </TypeFrameContainer>
  );
};
