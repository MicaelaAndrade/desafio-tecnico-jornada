import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  CorrectionRequest,
  CorrectionStatus,
  DailyTimesheet,
  MonthlyTimesheet,
  ShiftStatus,
  TeamMemberSummary,
  TimeEntry,
  TimeEntryType,
} from '../models/jornada.models';

@Injectable({ providedIn: 'root' })
export class JornadaService {
  private readonly http = inject(HttpClient);

  // --- Marcações -----------------------------------------------------------

  /**
   * Registra uma marcação do próprio colaborador.
   *
   * Não enviamos horário: o instante é definido pelo servidor. O cliente informa
   * apenas onde está, o que também é o que permite registrar jornada em viagem.
   */
  registrarMarcacao(payload: {
    type: TimeEntryType;
    timezone: string;
    countryCode: string;
    note?: string;
  }): Observable<TimeEntry> {
    return this.http.post<TimeEntry>('/api/time-entries', payload);
  }

  statusAtual(): Observable<ShiftStatus> {
    return this.http.get<ShiftStatus>('/api/time-entries/status');
  }

  marcacoes(params: {
    userId?: string;
    from?: string;
    to?: string;
    includeRevoked?: boolean;
  }): Observable<TimeEntry[]> {
    return this.http.get<TimeEntry[]>('/api/time-entries', { params: this.montarParams(params) });
  }

  // --- Folha de ponto ------------------------------------------------------

  espelhoMensal(year: number, month: number, userId?: string): Observable<MonthlyTimesheet> {
    return this.http.get<MonthlyTimesheet>('/api/timesheets/monthly', {
      params: this.montarParams({ year, month, userId }),
    });
  }

  espelhoPorPeriodo(from: string, to: string, userId?: string): Observable<DailyTimesheet[]> {
    return this.http.get<DailyTimesheet[]>('/api/timesheets/range', {
      params: this.montarParams({ from, to, userId }),
    });
  }

  resumoDaEquipe(year: number, month: number): Observable<TeamMemberSummary[]> {
    return this.http.get<TeamMemberSummary[]>('/api/timesheets/team', {
      params: this.montarParams({ year, month }),
    });
  }

  // --- Correções -----------------------------------------------------------

  solicitarCorrecao(payload: {
    userId?: string;
    type: 'ADD' | 'REMOVE' | 'MODIFY';
    targetEntryId?: string;
    proposedType?: TimeEntryType;
    proposedOccurredAt?: string;
    proposedTimezone?: string;
    proposedCountry?: string;
    workDate: string;
    reason: string;
  }): Observable<CorrectionRequest> {
    return this.http.post<CorrectionRequest>('/api/corrections', payload);
  }

  correcoes(status?: CorrectionStatus): Observable<CorrectionRequest[]> {
    return this.http.get<CorrectionRequest[]>('/api/corrections', {
      params: this.montarParams({ status }),
    });
  }

  homologarCorrecao(id: string, reviewNote?: string): Observable<CorrectionRequest> {
    return this.http.patch<CorrectionRequest>(`/api/corrections/${id}/approve`, { reviewNote });
  }

  rejeitarCorrecao(id: string, reviewNote?: string): Observable<CorrectionRequest> {
    return this.http.patch<CorrectionRequest>(`/api/corrections/${id}/reject`, { reviewNote });
  }

  cancelarCorrecao(id: string): Observable<CorrectionRequest> {
    return this.http.patch<CorrectionRequest>(`/api/corrections/${id}/cancel`, {});
  }

  // --- Fechamento ----------------------------------------------------------

  fecharCompetencia(payload: {
    userId: string;
    year: number;
    month: number;
    force?: boolean;
    note?: string;
  }): Observable<unknown> {
    return this.http.post('/api/closings/close', payload);
  }

  reabrirCompetencia(payload: {
    userId: string;
    year: number;
    month: number;
    reason: string;
  }): Observable<unknown> {
    return this.http.post('/api/closings/reopen', payload);
  }

  private montarParams(origem: Record<string, unknown>): HttpParams {
    let params = new HttpParams();

    for (const [chave, valor] of Object.entries(origem)) {
      if (valor !== undefined && valor !== null && valor !== '') {
        params = params.set(chave, String(valor));
      }
    }

    return params;
  }
}
