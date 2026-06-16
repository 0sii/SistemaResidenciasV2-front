import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../service/auth.service';
import { ImageModule } from 'primeng/image';
import { RouterModule } from '@angular/router';
import { finalize } from 'rxjs/operators'; // arriba



@Component({
  selector: 'app-login',
  imports: [CommonModule, ReactiveFormsModule, ImageModule, RouterModule],
  templateUrl: './login.html',
  styleUrl: './login.css'
})


export class LoginComponent {
  form: FormGroup;
  loading = signal(false);
  error = signal<string | null>(null);
  showPassword = signal(false);

  checkingSession = signal(true);

  constructor(
    private fb: FormBuilder,
    private auth: AuthService,
    private router: Router,
    private route: ActivatedRoute,) {
    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      remember: [true],
    });
  }


  ngOnInit() {
    this.checkingSession.set(true);

    // ✅ entrar al login SIEMPRE cierra sesión (solo esta pestaña)
    this.auth.logout();

    this.checkingSession.set(false);
  }




  get f() { return this.form.controls; }

  submit() {
    // ✅ Asegura valores actuales antes de validar (ayuda a Enter a la primera)
    this.form.updateValueAndValidity({ emitEvent: false });

    if (this.form.invalid || this.loading()) return;

    this.loading.set(true);
    this.error.set(null);

    const { email, password } = this.form.getRawValue();

    this.auth.login({ email, password }).subscribe({
      next: () => {
        this.loading.set(false);

        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') || '/dashboard';

        // ✅ NO recargar: el sidebar ya se actualizará por app.ts
        this.router.navigateByUrl(returnUrl);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message ?? 'Credenciales inválidas');
      }
    });
  }



}