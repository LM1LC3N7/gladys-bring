// -----------------------------------------------------------------------------
// Entry point: SDK wiring only. Every handler is registered BEFORE connect(),
// and delegates to the BringApp (src/app.js).
//
// Environment variables provided by the Gladys supervisor, read by the SDK:
// GLADYS_HOST_API_URL, GLADYS_INTEGRATION_TOKEN, GLADYS_INTEGRATION_SELECTOR.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { BringApp } from './src/app.js';
import { ACTIONS, SCENE_ACTIONS, WIDGETS } from './src/constants.js';

const gladys = new GladysIntegration();
const app = new BringApp({ gladys });

// --- Scene actions --------------------------------------------------------------
gladys.onSceneAction(SCENE_ACTIONS.ADD, (fields) => app.addItem(fields));
gladys.onSceneAction(SCENE_ACTIONS.COMPLETE, (fields) => app.completeItem(fields));
gladys.onSceneAction(SCENE_ACTIONS.REMOVE, (fields) => app.removeItem(fields));
gladys.onSceneAction(SCENE_ACTIONS.READ, (fields) => app.getList(fields));

// --- Dashboard widget ----------------------------------------------------------
gladys.onWidgetGet(WIDGETS.LIST, (request) => app.getWidget(request));
gladys.onWidgetAction(WIDGETS.LIST, (actionKey, params, context) =>
  app.widgetAction(actionKey, params, context),
);

// --- Configuration screen button ----------------------------------------------
gladys.onAction(ACTIONS.TEST, () => app.testConnection());

// --- Configuration changed by the user (or the session saved by the app) -------
gladys.onConfigUpdated((config) => app.configUpdated(config));

// --- Connection lifecycle ------------------------------------------------------
gladys.on('connected', async () => {
  try {
    await app.start(await gladys.getConfig());
  } catch (err) {
    logger.error('Start failed', err);
  }
});
gladys.on('disconnected', () => app.stop());
gladys.handleShutdown(() => app.stop());

logger.info('Starting the Bring! integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
