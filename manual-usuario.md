# Manual de Usuario

## 1. Objetivo del sistema

El presente documento describe el uso del sistema de gestión académica y de vinculación institucional desarrollado para administrar estudiantes, docentes, empresas, proyectos, periodos académicos, usuarios y seguimiento de actividades relacionadas con la residencia y proyectos académicos.

El sistema permite centralizar la información de los actores involucrados en el proceso, así como la gestión de permisos, estados, documentación y accesos a módulos funcionales de acuerdo con el rol asignado a cada usuario.

## 2. Alcance

El sistema está orientado a apoyar las actividades de:

- administración de estudiantes y candidatos,
- control de docentes y perfiles académicos,
- registro y consulta de empresas,
- gestión de proyectos y documentos asociados,
- administración de periodos académicos,
- control de usuarios y permisos,
- revisión de proyectos por docentes,
- seguimiento de avances y cierre documental,
- consulta de información personal y de perfil del usuario.

## 3. Requisitos de acceso y entorno

### 3.1 Requisitos del usuario

Para operar el sistema, el usuario deberá contar con:

- credenciales de acceso válidas,
- un navegador web compatible con aplicaciones Angular,
- permisos asignados por el administrador del sistema,
- acceso a la infraestructura de red o servidor donde se despliega la aplicación.

### 3.2 Requisitos técnicos

Se recomienda contar con:

- Node.js instalado en el equipo de desarrollo,
- Angular CLI y dependencias del proyecto configuradas,
- conexión con el backend o servicios asociados,
- disponibilidad de la base de datos del sistema.

### 3.3 Ejecución local

Para iniciar la aplicación de forma local, se puede ejecutar el siguiente comando desde la raíz del proyecto:

```bash
npm start
```

La aplicación normalmente queda disponible en la siguiente dirección:

```text
http://localhost:4200/
```

## 4. Inicio de sesión

La pantalla de inicio de sesión es la primera vista del sistema y permite autenticar al usuario antes de acceder a cualquier módulo.

### 4.1 Procedimiento

1. Ingrese la URL del sistema en el navegador.
2. En la pantalla de login, capture su correo electrónico y contraseña.
3. Seleccione la opción de iniciar sesión.
4. El sistema validará las credenciales y, si son correctas, se redirigirá al panel principal.

### 4.2 Consideraciones

- La ruta de acceso inicial se encuentra protegida y redirige a la vista de login si no existe una sesión activa.
- En caso de que la sesión haya caducado o no sea válida, el sistema cerrará el acceso y solicitará autenticación nuevamente.
- El sistema puede requerir cambio de contraseña en determinados escenarios de seguridad.

## 5. Cambio de contraseña

La opción de cambio de contraseña permite actualizar la clave de acceso del usuario, en cumplimiento con los procedimientos de seguridad institucional.

### 5.1 Proceso

1. Iniciar sesión en el sistema.
2. Acceder a la opción de cambio de contraseña.
3. Ingresar la contraseña actual.
4. Registrar la nueva contraseña.
5. Confirmar la nueva contraseña.
6. Guardar los cambios.

### 5.2 Recomendaciones

- Utilizar una contraseña segura y de uso exclusivo.
- No compartir credenciales con otros usuarios.
- Cambiar la contraseña si se sospecha acceso no autorizado.

## 6. Interfaz principal

Una vez autenticado, el usuario accede a la interfaz principal del sistema, la cual está integrada por:

- barra lateral de navegación,
- cabecera o encabezado del sistema,
- área central de trabajo,
- panel de dashboard y accesos rápidos.

La estructura visual está diseñada para facilitar la navegación basada en roles y permisos. La barra lateral muestra únicamente las opciones autorizadas para el usuario activo.

## 7. Dashboard

El dashboard constituye la pantalla principal del sistema y funciona como centro de control para la navegación y visualización de módulos.

### 7.1 Funcionalidades principales

El dashboard permite:

- consultar el estado general del sistema,
- acceder rápidamente a los módulos más utilizados,
- visualizar opciones según el rol activo del usuario,
- navegar a pantallas de gestión y consulta.

### 7.2 Módulos visibles desde el dashboard

Entre las opciones disponibles se encuentran:

- Proyectos
- Estudiantes
- Docentes
- Empresas
- Seguimiento
- Períodos académicos
- Usuarios
- Banco de proyectos
- Mis proyectos
- Mi perfil

## 8. Módulos del sistema

### 8.1 Módulo de estudiantes

Este módulo permite administrar la información relacionada con estudiantes o candidatos del programa.

#### Funciones principales

- consulta de estudiantes,
- registro y actualización de información,
- control del estado de cada estudiante,
- revisión de datos asociados al proceso académico.

#### Consideraciones

- La información debe validarse antes de guardar cambios.
- Los accesos a este módulo dependen de los permisos asignados al usuario.

### 8.2 Módulo de docentes

Este módulo permite gestionar los datos del personal docente y académico involucrado en el proceso.

#### Funciones principales

- consulta de docentes,
- actualización de perfiles,
- administración de roles y asignaciones académicas.

### 8.3 Módulo de empresas

El módulo de empresas permite registrar y consultar organizaciones participantes en la vinculación institucional.

#### Funciones principales

- consulta de empresas,
- creación y actualización de información institucional,
- relación con proyectos y actividades académicas.

### 8.4 Módulo de proyectos

El módulo de proyectos es uno de los componentes centrales del sistema y permite gestionar la información de proyectos académicos y de residencia.

#### Funciones principales

- consulta de proyectos,
- creación de nuevos registros,
- edición de información del proyecto,
- revisión de estados y documentación,
- administración de documentos asociados.

#### Proceso recomendado

1. Acceder al módulo de proyectos.
2. Seleccionar el registro correspondiente.
3. Revisar su información y estado.
4. Realizar las modificaciones necesarias.
5. Guardar los cambios para actualizar la información.

### 8.5 Módulo de periodos académicos

Este módulo permite gestionar los periodos relacionados con la convocatoria, evaluación y seguimiento del proceso académico.

#### Funciones principales

- consulta de periodos,
- registro de fechas y estados,
- organización de actividades por periodo académico.

### 8.6 Módulo de usuarios

Permite administrar los usuarios del sistema y asignar los permisos necesarios para cada rol.

#### Funciones principales

- consulta de usuarios,
- administración de accesos,
- asignación de permisos,
- administración de roles y perfiles.

### 8.7 Banco de proyectos

Este módulo funciona como repositorio o catálogo de proyectos disponibles dentro del sistema.

#### Uso principal

- consulta de proyectos registrados,
- revisión de información para apoyar la asignación o vinculación,
- acceso a datos relevantes para la toma de decisiones académicas.

### 8.8 Módulo de mis proyectos (docente)

Este módulo está diseñado para apoyar al personal docente en la revisión y administración de proyectos asignados o relacionados con su actividad académica.

#### Funciones principales

- visualización de proyectos asignados,
- consulta del detalle del proyecto,
- revisión del estado y avance del proceso.

### 8.9 Módulo de oficios consolidados

Este módulo permite consolidar y revisar documentación institucional vinculada a oficios, asignaciones y seguimiento administrativo.

#### Uso recomendado

- revisar la información antes de entregarla o exportarla,
- mantener actualizados los datos con base en el proyecto y la aprobación correspondiente.

### 8.10 Módulo de seguimiento

El módulo de seguimiento permite supervisar el avance de proyectos o procesos asignados al usuario, principalmente en el caso de estudiantes.

#### Requisito de acceso

El acceso al módulo de seguimiento está condicionado a la existencia de un perfil de estudiante con proyecto asociado.

#### Funciones principales

- consulta del avance del proyecto,
- revisión de estados de entregables,
- monitoreo de la evolución del proceso por etapas.

### 8.11 Módulo de egresados

Permite consultar la información relacionada con egresados del programa o institución.

#### Uso principal

- consulta y revisión de registros,
- actualización de datos cuando aplique,
- apoyo al seguimiento posterior del estudiante.

### 8.12 Módulo de perfil

El módulo de perfil permite consultar la información del usuario autenticado y revisar los permisos y datos asociados a su cuenta.

#### Información que puede visualizarse

- datos personales,
- información de contacto,
- rol activo,
- permisos vigentes asociados al perfil de usuario.

## 9. Gestión de permisos y seguridad

El sistema incorpora mecanismos de control de acceso mediante permisos, con el propósito de restringir la visualización y operación de módulos según el rol del usuario.

### 9.1 Comportamiento del sistema

- Un usuario solo podrá visualizar los módulos autorizados para su perfil.
- Si un usuario intenta acceder a una ruta sin permiso, el sistema lo redirige al dashboard principal.
- La visibilidad de las opciones del menú depende del conjunto de permisos activos del usuario.

### 9.2 Recomendaciones administrativas

Si un usuario presenta dificultades para acceder a un módulo, se recomienda:

1. verificar el rol asignado,
2. confirmar que el permiso correspondiente esté activo,
3. revisar la configuración del perfil del usuario,
4. solicitar la actualización de permisos al administrador del sistema.

## 10. Buenas prácticas de uso

Para asegurar un uso eficiente y seguro del sistema, se recomienda:

- cerrar sesión al finalizar la jornada de trabajo,
- guardar los cambios con frecuencia,
- mantener la información actualizada,
- revisar los permisos antes de asignar responsabilidades,
- utilizar filtros y búsquedas para localizar registros rápidamente,
- validar datos antes de confirmar modificaciones o entregas.

## 11. Solución de problemas comunes

### 11.1 No puede iniciar sesión

Posibles causas:

- credenciales incorrectas,
- usuario inactivo o no autorizado,
- falla de conexión con el backend,
- sesión vencida.

### 11.2 No visualiza un módulo en la barra lateral

Puede deberse a:

- ausencia de permisos para ese módulo,
- perfil de usuario no compatible con la opción,
- rol activo incorrecto.

### 11.3 El sistema redirige al dashboard

Esto puede ocurrir por:

- acceso restringido,
- ausencia de permisos,
- sesión inválida o cerrada.

### 11.4 No puede acceder al módulo de seguimiento

La habilitación de este módulo depende de la condición del usuario y la existencia de un proyecto asociado.

## 12. Definiciones clave

- Dashboard: pantalla principal del sistema, utilizada como centro de navegación y control.
- Permiso: autorización para acceder a un módulo o funcionalidad específica.
- Proyecto: actividad académica o de residencia vinculada a un estudiante, docente o institución.
- Seguimiento: revisión del avance, control de etapas y evaluación del proyecto.
- Perfil: conjunto de datos y permisos asociados al usuario autenticado.

## 13. Conclusión

El sistema de gestión constituye una herramienta central para la administración académica y operativa del proceso de vinculación, permitiendo controlar información crítica, permisos, estados, documentación y seguimiento de proyectos. Su uso correcto depende de una autenticación adecuada, una asignación precisa de roles y permisos, y un mantenimiento constante de la información registrada.

Este manual tiene como finalidad orientar al usuario en el manejo del sistema y facilitar la operación de cada módulo de manera segura, clara y eficiente.
