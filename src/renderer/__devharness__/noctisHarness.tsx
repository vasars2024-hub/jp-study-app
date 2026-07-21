import React from 'react';
import { createRoot } from 'react-dom/client';

import { createInitialState, ERA_ORDER, evaluateCivilization } from '../../main/city/engine';
import { CITY_WIRE_VERSION, CityStateMessage } from '../../main/city/ipc/channels';
import NoctisWorkspace from '../../main/city/ui/NoctisWorkspace';
import '../theme/tokens.css';
import '../styles.css';
import '../components/ui/ui.css';

const input = {
  focusDuration: 42,
  profile: {
    conceptualDepth: 0.72,
    retention: 0.78,
    disciplinaryExposure: 0.12,
    interdisciplinaryConnection: 0.05,
    sustainedAttention: 0.74,
    mastery: 0.58,
    curiosity: 0.46,
    revisionStrength: 0.38,
    difficulty: 0.44,
    novelty: 0.32,
  },
  pathways: { brine: 0.04, glucans: 0.8, catalysts: 0.16 },
  difficulty: 0.44,
  difficultyConfidence: 'inferred' as const,
  consistency: 4,
  completion: true,
};
const evaluated = evaluateCivilization(createInitialState(731), input);
const harnessParams = new URLSearchParams(window.location.search);
const requestedEra = Number(harnessParams.get('era') || 1);
const previewEraIndex = Math.max(0, Math.min(ERA_ORDER.length - 1, Math.floor(requestedEra) - 1));
evaluated.state.era.designation = ERA_ORDER[previewEraIndex];
evaluated.state.era.history = ERA_ORDER.slice(0, previewEraIndex + 1);
if (harnessParams.get('status') === 'hibernating') evaluated.state.status = 'hibernating';
if (harnessParams.get('state') === 'dimmed') evaluated.state.ecology.illumination = 0.05;
const message: CityStateMessage = {
  schemaVersion: CITY_WIRE_VERSION,
  state: evaluated.state,
  flags: evaluated.flags,
};

document.body.style.margin = '0';
document.body.style.width = '100vw';
document.body.style.height = '100vh';
document.body.style.overflow = 'hidden';
const root = document.getElementById('root');
if (root) {
  root.style.width = '100%';
  root.style.height = '100%';
  createRoot(root).render(<NoctisWorkspace message={message} />);
}
