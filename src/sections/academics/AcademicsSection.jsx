// Academics — internship openings feed, application tracker,
// uni assignments, and a LeetCode habit calendar.
import React, { useState } from 'react';
import { Tabs } from '../../components/ui';
import Openings from './Openings';
import Applications from './Applications';
import ApplicationDocs from './ApplicationDocs';
import Assignments from './Assignments';
import LeetCode from './LeetCode';

const TABS = ['New openings', 'My applications', 'CV & cover letter', 'Assignments', 'LeetCode'];

export default function AcademicsSection() {
  const [tab, setTab] = useState(TABS[0]);

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <Tabs tabs={TABS} active={tab} onChange={setTab} />
      </div>
      {tab === 'New openings' && <Openings />}
      {tab === 'My applications' && <Applications />}
      {tab === 'CV & cover letter' && <ApplicationDocs />}
      {tab === 'Assignments' && <Assignments />}
      {tab === 'LeetCode' && <LeetCode />}
    </div>
  );
}
