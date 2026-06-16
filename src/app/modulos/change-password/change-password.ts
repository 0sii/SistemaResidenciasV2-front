import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, Validators, AbstractControl, ReactiveFormsModule } from '@angular/forms';
import { AuthService } from '../../service/auth.service';
import { MessageService } from 'primeng/api';
import { Toast } from 'primeng/toast';
import { Router } from '@angular/router';

function match(group: AbstractControl) {
  const a = group.get('newPassword')?.value;
  const b = group.get('confirmNewPassword')?.value;
  return a && b && a !== b ? { passwordMismatch: true } : null;
}

@Component({
  selector: 'app-change-password',
  imports: [CommonModule, ReactiveFormsModule, Toast],
  templateUrl: './change-password.html',
  providers: [MessageService]
})
export class ChangePasswordComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private messageService = inject(MessageService);
  private router = inject(Router);

  loading = signal(false);
  sendingCode = signal(false);
  cooldown = signal(0);
  error = signal<string | null>(null);
  success = signal<string | null>(null);
  show = signal(false);

  // control de fase (antes/después de enviar código)
  codeRequested = signal(false);

  private otpId: string | null = null;

  form = this.fb.group({
    email: [{ value: this.auth.currentUserEmail(), disabled: false }, [Validators.required, Validators.email]],
    code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
    newPassword: ['', [Validators.required, Validators.minLength(6)]],
    confirmNewPassword: ['', Validators.required]
  }, { validators: match });

  ngOnInit(): void {
    this.lockFormBeforeCode();
  }

  invalid(c: string) {
    const ctrl = this.form.get(c)!;
    return ctrl.touched && ctrl.invalid;
  }

  // ===== Bloqueo/Desbloqueo =====
  private setControlsEnabled(enabled: boolean) {
    const names = ['code', 'newPassword', 'confirmNewPassword'];
    for (const n of names) {
      const c = this.form.get(n);
      if (!c) continue;
      enabled ? c.enable({ emitEvent: false }) : c.disable({ emitEvent: false });
    }
  }

  private lockFormBeforeCode() {
    this.codeRequested.set(false);
    this.form.get('email')?.enable({ emitEvent: false });
    this.setControlsEnabled(false);
  }

  private unlockAfterCode() {
    this.codeRequested.set(true);
    this.form.get('email')?.disable({ emitEvent: false });
    this.setControlsEnabled(true);
  }

  // ===== Enviar OTP =====
  sendCode() {
    if (this.sendingCode() || this.cooldown() > 0) return;

    const emailCtrl = this.form.get('email');
    if (emailCtrl?.invalid) {
      emailCtrl.markAsTouched();
      return;
    }

    this.sendingCode.set(true);
    this.error.set(null);
    this.success.set(null);

    const email = String(emailCtrl?.value);

    this.auth.requestOtp(email).subscribe({
      next: (res: { otpId: string }) => {
        this.sendingCode.set(false);
        this.otpId = res.otpId;

        // UI local
        this.success.set('Código enviado a tu correo.');
        this.unlockAfterCode();
        this.startCooldown(60);

        // ✅ 1 SOLO mensaje por operación
        this.messageService.add({
          severity: 'success',
          summary: 'Código enviado',
          detail: 'Revisa tu correo e ingresa el código de 6 dígitos.',
          life: 6000
        });
      },
      error: () => {
        this.sendingCode.set(false);

        // UI local
        this.error.set('No se pudo enviar el código. Intenta nuevamente.');

        // ✅ 1 SOLO mensaje por operación (sin mensaje del backend)
        this.messageService.add({
          severity: 'error',
          summary: 'No se pudo enviar el código',
          detail: 'Verifica tu conexión e intenta de nuevo.',
          life: 8000
        });
      }
    });
  }

  private startCooldown(sec: number) {
    this.cooldown.set(sec);
    const t = setInterval(() => {
      const n = this.cooldown() - 1;
      this.cooldown.set(n);
      if (n <= 0) clearInterval(t);
    }, 1000);
  }

  // ===== Submit =====
  submit() {
    if (!this.codeRequested()) return;
    if (this.loading()) return;

    // Validación
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    if (!this.otpId) {
      this.error.set('Primero solicita el código de verificación.');
      this.messageService.add({
        severity: 'warn',
        summary: 'Falta el código',
        detail: 'Primero presiona “Enviar código”.',
        life: 7000
      });
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.success.set(null);

    const { code, newPassword } = this.form.getRawValue();
    const email = String(this.form.get('email')?.value);

    this.auth.verifyOtpAndChangePassword(
      this.otpId,
      String(code),
      String(newPassword),
      email
    ).subscribe({
      next: async () => {
        this.loading.set(false);

        // UI local
        this.success.set('Contraseña actualizada.');

        // ✅ 1 SOLO mensaje por operación
        this.messageService.add({
          severity: 'success',
          summary: 'Contraseña actualizada',
          detail: 'Vuelve a iniciar sesión con tu nueva contraseña.',
          life: 7000
        });

        await new Promise(r => setTimeout(r, 1200));
        this.auth.logout();
        this.router.navigate(['/login']);
      },
      error: () => {
        this.loading.set(false);

        // UI local
        this.error.set('No se pudo cambiar la contraseña. Verifica el código e intenta de nuevo.');

        // ✅ 1 SOLO mensaje por operación (sin mensaje del backend)
        this.messageService.add({
          severity: 'error',
          summary: 'No se pudo cambiar la contraseña',
          detail: 'Asegúrate de que el código sea correcto y no haya expirado.',
          life: 9000
        });
      }
    });
  }

  cancel() {
    window.history.back();
  }
}
