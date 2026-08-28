import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { RouterPageStyle } from '@components/pages';
import { EventDialoguePage } from './EventDialogue.page';

const EventDialogueRouterComponent = () => {
  return (
    <RouterPageStyle>
      <Routes>
        <Route path="" element={<EventDialoguePage />} />
      </Routes>
    </RouterPageStyle>
  );
};

export default EventDialogueRouterComponent;
