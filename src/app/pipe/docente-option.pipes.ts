import { Pipe, PipeTransform } from '@angular/core';

/** Devuelve el nombrePlano de una opción dada su value (id) */
@Pipe({ name: 'findLabel', standalone: true, pure: false })
export class FindLabelPipe implements PipeTransform {
  transform(options: Array<{ value: number; nombrePlano: string }> | null, id: number | null): string {
    if (!options || !id) return '—';
    return options.find(o => o.value === id)?.nombrePlano ?? '—';
  }
}

/** Filtra un arreglo de opciones dejando solo las que tienen value incluido en ids */
@Pipe({ name: 'filterIds', standalone: true, pure: false })
export class FilterIdsPipe implements PipeTransform {
  transform(options: Array<{ value: number; [key: string]: any }> | null, ids: number[]): Array<{ value: number; [key: string]: any }> {
    if (!options || !ids?.length) return [];
    return options.filter(o => ids.includes(o.value));
  }
}
