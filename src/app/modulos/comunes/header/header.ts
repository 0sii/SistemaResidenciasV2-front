
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ImageModule } from 'primeng/image';

@Component({
  selector: 'app-header',
  imports: [CommonModule, ImageModule],
  templateUrl: './header.html',
  styleUrl: './header.css'
})
export class Header {

  // Lógica para comprobar el modo oscuro
  isDarkMode = false;

  ngOnInit() {
    if (typeof window !== 'undefined') {
      // Aquí puedes usar `window` de forma segura, ya que estamos en el navegador.
      this.isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
      //console.log(window.innerWidth);
    }
    // Verificar si el usuario tiene configurado el modo oscuro en el sistema


  }

  @Input() title = 'Departamento de Vinculación de Proyectos';
  @Input() logoSrc = 'assets/Logo-TecNM.png'; // cambia por el tuyo
}


