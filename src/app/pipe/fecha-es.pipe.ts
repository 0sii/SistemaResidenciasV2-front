import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'fechaEs',
  standalone: true
})
export class FechaEsPipe implements PipeTransform {

  private readonly formatterFecha = new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  private readonly formatterFechaHora = new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  transform(value: string | Date | null | undefined, conHora: boolean = true): string {
    if (!value) return '-';

    const fecha = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(fecha.getTime())) return '-';

    const texto = conHora
      ? this.formatterFechaHora.format(fecha)
      : this.formatterFecha.format(fecha);

    return texto
      .replace(/\sa\.?\s?m\.?/i, ' a. m.')
      .replace(/\sp\.?\s?m\.?/i, ' p. m.');
  }
}

@Pipe({ name: 'findLabel', standalone: true, pure: false })
export class FindLabelPipe implements PipeTransform {
  transform(options: Array<{ value: number; nombrePlano: string }> | null, id: number | null): string {
    if (!options || !id) return '—';
    return options.find(o => o.value === id)?.nombrePlano ?? '—';
  }
}

@Pipe({ name: 'filterIds', standalone: true, pure: false })
export class FilterIdsPipe implements PipeTransform {
  transform(options: Array<{ value: number; [key: string]: any }> | null, ids: number[]): Array<{ value: number; [key: string]: any }> {
    if (!options || !ids?.length) return [];
    return options.filter(o => ids.includes(o.value));
  }
}