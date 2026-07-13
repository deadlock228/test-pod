// Punto de entrada del dominio de campañas.
export { CampaignScheduler } from './campaignScheduler.js';
export { CampaignRepository, CampaignStatus, toMillis } from './campaignRepository.js';
export {
  CampaignError,
  CampaignNotFoundError,
  InvalidScheduleError,
  InvalidStateError,
} from './errors.js';
