// Errores de dominio para la programación de campañas.

export class CampaignError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'CampaignError';
    this.code = code;
  }
}

export class CampaignNotFoundError extends CampaignError {
  constructor(id) {
    super(`Campaña no encontrada: ${id}`, 'CAMPAIGN_NOT_FOUND');
    this.name = 'CampaignNotFoundError';
  }
}

export class InvalidScheduleError extends CampaignError {
  constructor(message) {
    super(message, 'INVALID_SCHEDULE');
    this.name = 'InvalidScheduleError';
  }
}

export class InvalidStateError extends CampaignError {
  constructor(message) {
    super(message, 'INVALID_STATE');
    this.name = 'InvalidStateError';
  }
}
