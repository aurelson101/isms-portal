export const spanishMessages: Readonly<Record<string, string>> = {
  "At /moderator, Managed documents, Document import and My document permissions are separate views. Space submenus show only areas you can manage; choosing a space filters documents on the server.":
    "En /moderator, Documentos gestionados, Importación documental y Mis permisos documentales son vistas separadas. Los submenús solo muestran los espacios que puede gestionar; al elegir un espacio, los documentos se filtran en el servidor.",
  "The portal and moderator workspace show at most twenty documents per page. Previous and Next retain the space and search. Changing space or returning to Managed documents starts at page 1.":
    "El portal y el espacio del moderador muestran como máximo veinte documentos por página. Anterior y Siguiente conservan el espacio y la búsqueda. Cambiar de espacio o volver a Documentos gestionados lleva a la página 1.",
  "Use Edit for metadata without creating a version, and New version to replace the file. Switching views preserves open forms and selected files; changing space may ask you to discard unsaved edits. Cards adapt to mobile, QHD and 4K screens.":
    "Use Editar para los metadatos sin crear una versión y Nueva versión para sustituir el archivo. Cambiar de vista conserva los formularios abiertos y los archivos seleccionados; al cambiar de espacio puede solicitarse descartar los cambios sin guardar. Las fichas se adaptan a pantallas móviles, QHD y 4K.",
  " (new tab)": " (nueva pestaña)",
  " · Until ": " · Hasta ",
  "A PostgreSQL, Redis, storage or antivirus failure may prevent some operations even when the portal loads.":
    "Un fallo de PostgreSQL, Redis, almacenamiento o antivirus puede impedir ciertas operaciones aunque el portal cargue.",
  "A connectivity test does not prove ingestion: check Zabbix, Wazuh or the receiving service.":
    "Una prueba de conectividad no demuestra la recepción: compruebe Zabbix, Wazuh o el servicio receptor.",
  "A directory CA certificate is not an SSO client certificate. Manage each certificate renewal in its own configuration and keep private keys outside the source repository.":
    "Un certificado de CA del directorio no es un certificado cliente SSO. Gestione cada renovación en su configuración y mantenga las claves privadas fuera del repositorio.",
  "A field exceeds the allowed length.":
    "Un campo supera la longitud permitida.",
  "A group present in ISMS grants no rights without an associated rule. Deleting its local entry does not delete the AD group; it may return at the next synchronization.":
    "Un grupo presente en ISMS no concede derechos sin una regla asociada. Eliminar su entrada local no elimina el grupo AD; puede reaparecer en la próxima sincronización.",
  "A maximum of one or two public certificates, stored in PostgreSQL and kept separate from documents.":
    "Uno o dos certificados públicos como máximo, almacenados en PostgreSQL y separados de los documentos.",
  "A rule in this editor applies to the space, not to an isolated subcategory. Do not treat document organization as a security restriction: create a separate space if its audience must differ.":
    "Una regla de este editor se aplica al espacio, no a una subcategoría aislada. La organización documental no restringe el acceso: cree otro espacio si debe tener un público diferente.",
  "A technical log or email does not replace a business audit record. Do not directly change audit rows to fix an incident; perform a new authorized operation and retain records.":
    "Un registro técnico o correo no sustituye al registro de auditoría. No modifique sus filas para corregir un incidente; realice otra operación autorizada y conserve los registros.",
  "A tracking reference will be provided after submission.":
    "Recibirá una referencia de seguimiento tras el envío.",
  "AD administrator groups": "Grupos de administradores AD",
  "AD group": "Grupo AD",
  "AD group DN": "DN del grupo AD",
  "AD group description": "Descripción del grupo AD",
  "AD group name": "Nombre del grupo AD",
  "AD group reference added.": "Referencia del grupo AD añadida.",
  "AD selection": "Selección AD",
  "AD synchronized": "Sincronizado con AD",
  "AD user": "Usuario AD",
  "AD users": "Usuarios AD",
  "Accepted formats: ADCS certificate or chain in X.509 PEM, DER or PKCS#7 format (.pem, .crt, .cer, .p7b, .p7c), without a private key.":
    "Formatos admitidos: certificado ADCS o cadena X.509 PEM, DER o PKCS#7 (.pem, .crt, .cer, .p7b, .p7c), sin clave privada.",
  "Accepted formats: PDF, Word (.docx), and Excel (.xlsx), up to 50 MB.":
    "Formatos admitidos: PDF, Word (.docx) y Excel (.xlsx), hasta 50 MB.",
  "Accepted formats: PDF, Word DOCX and Excel XLSX. Users view them in read-only mode.":
    "Formatos admitidos: PDF, Word DOCX y Excel XLSX. Los usuarios los consultan en modo de solo lectura.",
  "Access changed.": "Acceso modificado.",
  "Access denied": "Acceso denegado",
  "Access duration": "Duración del acceso",
  "Access governance": "Gobernanza de accesos",
  "Access must be checked after the decision with the relevant account. Do not add an overly broad group to handle an individual request, and do not copy confidential comments into requester email.":
    "Compruebe el acceso tras la decisión con la cuenta afectada. No añada un grupo demasiado amplio para una solicitud individual ni copie comentarios confidenciales en el correo al solicitante.",
  "Access request justification": "Justificación de la solicitud de acceso",
  "Access requests": "Solicitudes de acceso",
  "Access rights management": "Gestión de derechos de acceso",
  "Access rules": "Reglas de acceso",
  "Access source": "Origen del acceso",
  "Account preferences": "Preferencias de la cuenta",
  Acknowledge: "Confirmar lectura",
  Action: "Acción",
  "Action required": "Acción necesaria",
  Actions: "Acciones",
  "Activation requires a pilot assignment, a client secret installed on the server, and a controlled deployment. Secrets are never entered or displayed here.":
    "La activación requiere una asignación piloto, un secreto cliente instalado en el servidor y un despliegue controlado. Aquí nunca se introducen ni muestran secretos.",
  Active: "Activo",
  "Active Directory": "Active Directory",
  "Active Directory group": "Grupo de Active Directory",
  "Active Directory groups": "Grupos de Active Directory",
  "Active Directory session": "Sesión de Active Directory",
  "Active Directory sign-in is unavailable.":
    "El inicio de sesión de Active Directory no está disponible.",
  "Active administrator sessions": "Sesiones de administrador activas",
  "Active filters": "Filtros activos",
  "Active rules": "Reglas activas",
  "Active sessions": "Sesiones activas",
  Activity: "Actividad",
  Add: "Añadir",
  "Add 30-day CAPA": "Añadir CAPA a 30 días",
  "Add a comment explaining the decision.":
    "Añada un comentario explicando la decisión.",
  "Add a control": "Añadir un control",
  "Add a local administrator": "Añadir un administrador local",
  "Add a local moderator": "Añadir un moderador local",
  "Add a rule": "Añadir una regla",
  "Add an AD group": "Añadir un grupo AD",
  "Add an Active Directory group": "Añadir un grupo de Active Directory",
  "Add an Active Directory user": "Añadir un usuario de Active Directory",
  "Add categories and their hierarchy.": "Añada categorías y su jerarquía.",
  "Add category": "Añadir categoría",
  "Add moderator": "Añadir moderador",
  "Add moderator group": "Añadir grupo de moderadores",
  "Add selected group": "Añadir el grupo seleccionado",
  "Add selected user": "Añadir el usuario seleccionado",
  "Add storage": "Añadir almacenamiento",
  "Add subcategory": "Añadir subcategoría",
  "Add this key to Microsoft Authenticator, Google Authenticator, or another TOTP app:":
    "Añada esta clave a Microsoft Authenticator, Google Authenticator u otra aplicación TOTP:",
  "Add to favorites": "Añadir a favoritos",
  "Adding…": "Añadiendo…",
  "Adjust thresholds to real activity to avoid overwhelming recipients.":
    "Ajuste los umbrales a la actividad real para evitar saturar a los destinatarios.",
  Administration: "Administración",
  Administrator: "Administrador",
  "Administrator accounts": "Cuentas de administradores",
  "Administrator added.": "Administrador añadido.",
  "Administrator group added.": "Grupo de administradores añadido.",
  "Administrator profile": "Perfil de administrador",
  "Administrator sign in": "Inicio de sesión de administrador",
  "Administrator summary": "Resumen del administrador",
  "Administrator username": "Identificador del administrador",
  "Administrators retain all rights; this matrix applies to standard users.":
    "Los administradores conservan todos los derechos; esta matriz se aplica a los usuarios estándar.",
  "Advanced settings": "Configuración avanzada",
  "After publishing, check the document from the portal as a standard reader, then check the review queue in ISMS governance. Publication notifications and review alerts are two distinct events.":
    "Tras publicar, compruebe el documento desde el portal como lector estándar y después la cola de revisiones de Gobernanza ISMS. Las notificaciones de publicación y las alertas de revisión son eventos distintos.",
  "Alert channel configuration": "Configuración de canales de alerta",
  "Alert channels": "Canales de alerta",
  "Alert channels saved and secrets encrypted.":
    "Canales de alerta guardados y secretos cifrados.",
  "Alert thresholds": "Umbrales de alerta",
  All: "Todos",
  "All administrators can grant or revoke these rights. The primary account remains protected against deletion.":
    "Todos los administradores pueden conceder o revocar estos derechos. La cuenta principal sigue protegida contra la eliminación.",
  "All documents": "Todos los documentos",
  "All documents in this section": "Todos los documentos de esta sección",
  "All formats": "Todos los formatos",
  "All groups": "Todos los grupos",
  "All groups are current.": "Todos los grupos están actualizados.",
  "All languages": "Todos los idiomas",
  "All spaces": "Todos los espacios",
  "All user requests have been deleted.":
    "Se han eliminado todas las solicitudes de usuarios.",
  "An SSO account is not necessarily managed like a local account. Only use actions offered for your sign-in method.":
    "Una cuenta SSO no se gestiona necesariamente como una cuenta local. Utilice solo las acciones disponibles para su método de inicio de sesión.",
  "An email accepted by the provider is not proof of receipt.":
    "Un correo aceptado por el proveedor no demuestra su recepción.",
  "Analyze and correct root cause": "Analizar y corregir la causa raíz",
  "Annual acknowledgements": "Confirmaciones de lectura anuales",
  "Annual incident reports": "Informes anuales de incidentes",
  "Annual recertification": "Recertificación anual",
  "Annual register summary": "Resumen anual del registro",
  "Annual report": "Informe anual",
  "Annual report created.": "Informe anual creado.",
  "Annual report deleted.": "Informe anual eliminado.",
  "Annual report updated.": "Informe anual actualizado.",
  "Annual summary": "Resumen anual",
  Applicability: "Aplicabilidad",
  Applicable: "Aplicable",
  "Apply available filters and check action, result and date.":
    "Aplique los filtros disponibles y compruebe acción, resultado y fecha.",
  "Approval requires management permissions; check the decision author and date in the record.":
    "La aprobación requiere permisos de gestión; compruebe el autor y la fecha de la decisión en el registro.",
  "Approvals and Reviews": "Aprobaciones y revisiones",
  Approve: "Aprobar",
  "Approve this request?": "¿Aprobar esta solicitud?",
  Approved: "Aprobada",
  "Approved review": "Revisión aprobada",
  Approver: "Aprobador",
  Archive: "Archivar",
  "Archive / delete": "Archivar / eliminar",
  Archived: "Archivado",
  "Archiving, deletion and restoration": "Archivo, eliminación y restauración",
  "Area pages": "Páginas de espacios",
  "Assign permissions to groups and verify the result with a representative user account. After moving a document to another category, check it in the portal and in access rules.":
    "Asigne permisos a los grupos y verifique el resultado con una cuenta representativa. Tras mover un documento a otra categoría, compruébelo en el portal y en las reglas de acceso.",
  "Assign the intended role and check active sessions.":
    "Asigne el rol previsto y compruebe las sesiones activas.",
  "Assign the required spaces and document capabilities.":
    "Asigne los espacios y permisos documentales necesarios.",
  Assignments: "Asignaciones",
  "Associate groups and permissions in Access rules.":
    "Asocie grupos y permisos en Reglas de acceso.",
  "Associated active connectors will be disabled. Continue?":
    "Se desactivarán los conectores activos asociados. ¿Continuar?",
  "Audit exports may contain sensitive information. Restrict distribution and apply your organization's retention policy.":
    "Las exportaciones de auditoría pueden contener información sensible. Restrinja su distribución y aplique la política de conservación de su organización.",
  "Audit log": "Registro de auditoría",
  "Authorization matrix": "Matriz de autorizaciones",
  "Authorized sections": "Secciones autorizadas",
  Automatic: "Automático",
  "Automatic annual review: one moderator or administrator decision is required.":
    "Revisión anual automática: se requiere una decisión de un moderador o administrador.",
  "Automatic publication review: a decision is due within 30 days. Rejection archives the document.":
    "Revisión automática de publicación: debe decidirse en 30 días. El rechazo archiva el documento.",
  "Automatic retention of the 50 most recent events.":
    "Conservación automática de los 50 eventos más recientes.",
  "Automatic sign-in": "Inicio de sesión automático",
  "Automatic sign-in could not be started. Use your credentials.":
    "No se pudo iniciar la conexión automática. Utilice sus credenciales.",
  "Available for uploads": "Disponible para cargas",
  "Available in another language only": "Disponible solo en otro idioma",
  "Avoid distributing incident information to unrelated groups.":
    "Evite distribuir información de incidentes a grupos no relacionados.",
  "Back to portal": "Volver al portal",
  "Batch imports and notifications": "Importaciones por lotes y notificaciones",
  "Batch processing complete.": "Procesamiento del lote completado.",
  "Bearer token (optional)": "Token Bearer (opcional)",
  "Bookmarks / outline": "Marcadores / índice",
  Branding: "Identidad visual",
  "Branding configures portal information and logo. The FR / EN interface language remains independent from document language. Check desktop, tablet and mobile rendering after a visual change.":
    "Identidad visual configura los datos y el logotipo del portal. El idioma FR / EN / ES de la interfaz es independiente del idioma de los documentos. Compruebe ordenador, tableta y móvil tras un cambio visual.",
  Breadcrumb: "Ruta de navegación",
  "Briefly describe the issue…": "Describa brevemente el problema…",
  Browse: "Explorar",
  "Bulk deletion failed.": "La eliminación masiva ha fallado.",
  "Bulk operation applied and audited.":
    "Operación masiva aplicada y auditada.",
  "CA certificate": "Certificado de CA",
  "CA certificates": "Certificados de CA",
  CLOSED: "CERRADO",
  Cancel: "Cancelar",
  "Cancel editing": "Cancelar edición",
  Cancelled: "Cancelado",
  "Caps Lock is on": "Bloq Mayús activado",
  Category: "Categoría",
  "Category English name": "Nombre de la categoría en inglés",
  "Category French name": "Nombre de la categoría en francés",
  "Category pages": "Páginas de categorías",
  "Category slug": "Identificador de la categoría",
  "Category space": "Espacio de la categoría",
  "Certificate imported.": "Certificado importado.",
  Certificates: "Certificados",
  "Certificates expiring within 30 days": "Certificados que caducan en 30 días",
  Change: "Cambiar",
  "Change Active Directory": "Cambiar Active Directory",
  "Change only the profile options offered.":
    "Cambie solo las opciones de perfil disponibles.",
  "Change password": "Cambiar contraseña",
  "Change summary": "Resumen de cambios",
  "Changes apply immediately to group members.":
    "Los cambios se aplican inmediatamente a los miembros del grupo.",
  "Check assignment, credential validity, redirect and document access; retain fallback sign-in.":
    "Compruebe asignación, validez de las credenciales, redirección y acceso documental; conserve un método de conexión alternativo.",
  "Check before retry": "Comprobar antes de reintentar",
  "Check classification and access with a user account.":
    "Compruebe clasificación y acceso con una cuenta de usuario.",
  "Check content and recipient groups before distributing a report.":
    "Compruebe el contenido y los grupos destinatarios antes de distribuir un informe.",
  "Check delivery history and actual receipt.":
    "Compruebe el historial de envíos y la recepción real.",
  "Check editing, publishing and archiving permissions separately for the relevant spaces.":
    "Compruebe por separado los permisos de edición, publicación y archivo en los espacios afectados.",
  "Check editing, publishing and archiving without using an admin session as evidence.":
    "Compruebe edición, publicación y archivo sin utilizar una sesión de administrador como prueba.",
  "Check expiration and the complete chain without disabling TLS.":
    "Compruebe la caducidad y la cadena completa sin desactivar TLS.",
  "Check free space and test restoration outside production.":
    "Compruebe el espacio libre y pruebe la restauración fuera de producción.",
  "Check metadata and access after restoration.":
    "Compruebe metadatos y acceso después de restaurar.",
  "Check notification choice, scanning and state before publication.":
    "Compruebe la opción de notificación, el análisis y el estado antes de publicar.",
  "Check sign-in, portal and administration screens on mobile.":
    "Compruebe las pantallas de conexión, portal y administración en móvil.",
  "Check technical dependency availability and the storage information provided here.":
    "Compruebe la disponibilidad de las dependencias técnicas y la información de almacenamiento mostrada aquí.",
  "Check that the alert clears after resolution.":
    "Compruebe que la alerta desaparece tras resolver el problema.",
  "Check the displayed account and sign-in method.":
    "Compruebe la cuenta mostrada y el método de conexión.",
  "Check the document, participants and due date; assign appropriate follow-up.":
    "Compruebe documento, participantes y fecha límite; asigne el seguimiento adecuado.",
  "Check the preview, save and verify sign-in, portal and administration. Test a narrow screen to check title readability and logo proportions without enlarging navigation buttons.":
    "Compruebe la vista previa, guarde y verifique conexión, portal y administración. Pruebe una pantalla estrecha para comprobar título y logotipo sin ampliar los botones de navegación.",
  "Check the requester response and effective access.":
    "Compruebe la respuesta al solicitante y los accesos efectivos.",
  "Choose a category or section, then open your documents in the secure viewer.":
    "Elija una categoría o sección y abra sus documentos en el visor seguro.",
  "Choose initial upload, metadata or new version according to the operation.":
    "Elija carga inicial, metadatos o nueva versión según la operación.",
  "Choose the channel and enter its destination and available settings.":
    "Elija el canal e introduzca su destino y la configuración disponible.",
  "Choose the moderator account or group.":
    "Elija la cuenta o el grupo de moderadores.",
  "Choose the target type and enter its settings.":
    "Elija el tipo de destino e introduzca su configuración.",
  Clean: "Limpio",
  "Clear my history": "Borrar mi historial",
  "Clear search": "Borrar búsqueda",
  "Click New category, select Information technology, enter Procédures / Procedures and leave the parent category empty to create a root category.":
    "Pulse Nueva categoría, seleccione Informática, introduzca Procédures / Procedures y deje vacía la categoría superior para crear una categoría raíz.",
  "Client authentication": "Autenticación del cliente",
  "Client secret currently. Certificates are not supported by the current SSO proxy.":
    "Actualmente, secreto cliente. El proxy SSO actual no admite certificados.",
  Close: "Cerrar",
  "Close my workspace": "Cerrar mi espacio personal",
  "Close navigation": "Cerrar navegación",
  Closed: "Cerrado",
  Comfortable: "Cómoda",
  "Comma-separated groups": "Grupos separados por comas",
  Comment: "Comentario",
  Compact: "Compacta",
  Compare: "Comparar",
  "Compare counters with the relevant lists.":
    "Compare los contadores con las listas correspondientes.",
  "Compare with the previous version": "Comparar con la versión anterior",
  "Compensating control": "Control compensatorio",
  Completed: "Completadas",
  Configuration: "Configuración",
  "Configuration and use": "Configuración y uso",
  "Configuration saved.": "Configuración guardada.",
  "Configure TLS and the CA chain for LDAPS.":
    "Configure TLS y la cadena de CA para LDAPS.",
  "Configure on the ISMS server": "Configurar en el servidor ISMS",
  "Configure tenant, client and client secret server-side, then deploy the SSO proxy configuration.":
    "Configure tenant, cliente y secreto cliente en el servidor; después despliegue la configuración del proxy SSO.",
  "Configured moderators": "Moderadores configurados",
  Confirm: "Confirmar",
  "Confirm MFA": "Confirmar MFA",
  "Confirm action": "Confirmar acción",
  "Confirm and apply": "Confirmar y aplicar",
  "Confirm approval": "Confirmar aprobación",
  "Confirm lifetime": "Confirmar acceso permanente",
  "Confirm rejection": "Confirmar rechazo",
  "Connection interrupted. Try again.":
    "Conexión interrumpida. Inténtelo de nuevo.",
  "Connector saved.": "Conector guardado.",
  "Connector status": "Estado del conector",
  "Connector updated.": "Conector actualizado.",
  Connectors: "Conectores",
  "Consolidate incidents, resolutions, and lessons learned for each year.":
    "Consolide incidentes, resoluciones y lecciones aprendidas de cada año.",
  Contained: "Contenido",
  "Content and access": "Contenido y acceso",
  "Content summary": "Resumen del contenido",
  "Continue with Microsoft": "Continuar con Microsoft",
  "Copy link": "Copiar enlace",
  Correlation: "Correlación",
  "Could not refresh: ": "No se pudo actualizar: ",
  Create: "Crear",
  "Create a space": "Crear un espacio",
  "Create an exception": "Crear una excepción",
  "Create category": "Crear categoría",
  "Create document spaces, then categories and subcategories. French and English labels describe classification; they do not change file language. Define a stable structure before a large import.":
    "Cree los espacios documentales y después sus categorías y subcategorías. Los nombres franceses e ingleses describen la clasificación, no el idioma del archivo. Defina una estructura estable antes de importar un lote grande.",
  "Create or open the report for the relevant period.":
    "Cree o abra el informe del periodo correspondiente.",
  "Create review": "Crear revisión",
  "Create snapshot": "Crear instantánea",
  "Create the space with its FR and EN names.":
    "Cree el espacio con sus nombres FR y EN.",
  Critical: "Crítico",
  "Critical incidents": "Incidentes críticos",
  "Cumulative incidents": "Incidentes acumulados",
  "Current password": "Contraseña actual",
  "Current selection": "Selección actual",
  "Current session identity": "Identidad de la sesión actual",
  Dashboard: "Panel de control",
  "Decide, track and review the history of requests.":
    "Decida, realice el seguimiento y consulte el historial de solicitudes.",
  "Decision by": "Decisión de",
  "Decision comment": "Comentario de decisión",
  "Decision evidence": "Prueba de la decisión",
  Default: "Predeterminado",
  "Define document managers and their scope. They have a dedicated document management workspace rather than access to all administrative settings.":
    "Defina los responsables documentales y su ámbito. Disponen de un espacio dedicado a la gestión documental, no de acceso a toda la configuración administrativa.",
  "Define failure and denial thresholds, then choose a configured channel.":
    "Defina umbrales de fallos y denegaciones; después elija un canal configurado.",
  "Define permissions and duration before accepting, or justify rejection.":
    "Defina los permisos y su duración antes de aceptar, o justifique el rechazo.",
  Delete: "Eliminar",
  "Delete all": "Eliminar todo",
  "Delete permanently": "Eliminar definitivamente",
  "Delete this administrator?": "¿Eliminar este administrador?",
  "Delete this annual report?": "¿Eliminar este informe anual?",
  "Delete this certificate?": "¿Eliminar este certificado?",
  "Delete this document?": "¿Eliminar este documento?",
  "Delete this rule?": "¿Eliminar esta regla?",
  "Delete view": "Eliminar vista",
  "Deleted documents can be restored or permanently deleted.":
    "Los documentos eliminados pueden restaurarse o eliminarse definitivamente.",
  "Deletes all synchronized groups and their access rules before configuring another directory. Locally added groups are preserved.":
    "Elimina todos los grupos sincronizados y sus reglas de acceso antes de configurar otro directorio. Se conservan los grupos añadidos localmente.",
  "Deleting…": "Eliminando…",
  "Deletion failed.": "La eliminación ha fallado.",
  Density: "Densidad",
  "Describe what changed in this version.":
    "Describa los cambios de esta versión.",
  Description: "Descripción",
  "Destruction request after retention":
    "Solicitud de destrucción tras la conservación",
  "Destruction requested": "Destrucción solicitada",
  Details: "Detalles",
  "Detected anomalies": "Anomalías detectadas",
  "Detected groups": "Grupos detectados",
  "Detecting your Microsoft session…": "Detectando su sesión de Microsoft…",
  "Direct AD sign-in": "Inicio de sesión AD directo",
  "Directory synchronization failed.":
    "La sincronización del directorio ha fallado.",
  "Directory unavailable. Use manual entry.":
    "Directorio no disponible. Utilice la entrada manual.",
  Disable: "Desactivar",
  Disabled: "Desactivado",
  "Discard pending items? Uploaded documents will be kept.":
    "¿Descartar los elementos pendientes? Se conservarán los documentos cargados.",
  "Discard unsaved changes?": "¿Descartar los cambios no guardados?",
  Display: "Visualización",
  "Display mode": "Modo de visualización",
  "Display name": "Nombre para mostrar",
  "Display preferences": "Preferencias de visualización",
  "Do not confuse a published annual report with an active incident case. Avoid credentials, secrets, personal addresses and raw evidence in reports intended for a broad audience.":
    "No confunda un informe anual publicado con un incidente activo. Evite credenciales, secretos, direcciones personales y pruebas sin procesar en informes destinados a un público amplio.",
  "Do not create a guessed key or raw secret to bypass a missing form. Specialized APIs handle validation and encryption; the generic JSON editor is not a secrets vault.":
    "No invente una clave ni introduzca un secreto sin protección para sustituir un formulario ausente. Las API especializadas validan y cifran; el editor JSON genérico no es una bóveda de secretos.",
  "Do not delete volumes or data to resolve a red indicator.":
    "No elimine volúmenes ni datos para resolver un indicador rojo.",
  "Do not grant administrator privileges to reveal moderator document actions. Test with the actual moderator account, not an administrator retaining broader rights.":
    "No conceda privilegios de administrador para mostrar acciones documentales del moderador. Pruebe con su cuenta real, no con un administrador con derechos más amplios.",
  "Do not reset a local password to resolve an SSO issue.":
    "No restablezca una contraseña local para resolver un problema SSO.",
  "Do not run docker compose down -v, purge Redis or delete PostgreSQL files to clear an alert. Green readiness does not test the entire SSO, ACL and email delivery workflow.":
    "No ejecute docker compose down -v, vacíe Redis ni elimine archivos PostgreSQL para borrar una alerta. La disponibilidad correcta no valida todo el flujo SSO, ACL y correo.",
  "Do not send email": "No enviar correo",
  "Do not send email notifications": "No enviar notificaciones por correo",
  "Do not send email notifications for this upload or publication":
    "No enviar notificaciones por correo para esta carga o publicación",
  "Do not treat enabling this policy as subscribing every user to every document. Operational alerts should target monitoring owners; check the audience before enabling.":
    "Activar esta política no suscribe a todos los usuarios a todos los documentos. Las alertas operativas deben dirigirse a los responsables de supervisión; compruebe los destinatarios antes de activarlas.",
  "Do not use an image containing sensitive data as the logo. Keep a copy of previous branding to revert; this page configures neither DNS, HTTPS nor SSO.":
    "No use un logotipo con datos sensibles. Conserve una copia de la identidad visual anterior para restaurarla; esta página no configura DNS, HTTPS ni SSO.",
  Document: "Documento",
  "Document data and files must be backed up together. The trash does not replace backups or restoration testing.":
    "Los datos documentales y los archivos deben respaldarse juntos. La papelera no sustituye las copias de seguridad ni las pruebas de restauración.",
  "Document explorer": "Explorador de documentos",
  "Document filters": "Filtros documentales",
  "Document import": "Importación documental",
  "Document information": "Información del documento",
  "Document language": "Idioma del documento",
  "Document management limited to your effective permissions.":
    "Gestión documental limitada a sus permisos efectivos.",
  "Document pagination": "Paginación de documentos",
  "Document portal": "Portal documental",
  "Document review": "Revisión documental",
  "Document spaces": "Espacios documentales",
  "Document storage": "Almacenamiento documental",
  "Document trash": "Papelera documental",
  "Document updated.": "Documento actualizado.",
  "Documentary evidence": "Pruebas documentales",
  Documents: "Documentos",
  "Documents and access": "Documentos y acceso",
  "Documents are temporarily unavailable.":
    "Los documentos no están disponibles temporalmente.",
  Domain: "Dominio",
  Done: "Listo",
  "Dormant accounts": "Cuentas inactivas",
  "Dormant accounts (90d)": "Cuentas inactivas (90 días)",
  Download: "Descargar",
  "Download attachment": "Descargar adjunto",
  Draft: "Borrador",
  "Due date": "Fecha límite",
  "E.g. contractor@example.com": "Ej.: contractor@example.com",
  Edit: "Editar",
  "Edit / new version": "Editar / nueva versión",
  "Edit and upload a new version": "Editar y cargar una nueva versión",
  "Edit category": "Editar categoría",
  "Edit connector": "Editar conector",
  "Edit metadata": "Editar metadatos",
  "Edit metadata to correct the title, description, language or category without uploading a new file. Check the chosen language and classification after saving.":
    "Edite los metadatos para corregir título, descripción, idioma o categoría sin cargar otro archivo. Compruebe el idioma y la clasificación después de guardar.",
  "Edit report": "Editar informe",
  "Editable matrix and preview": "Matriz editable y vista previa",
  "Email and alert channels": "Correo y canales de alerta",
  "Email attribute": "Atributo de correo",
  "Email history pagination": "Paginación del historial de correos",
  "Email notifications": "Notificaciones por correo",
  Enable: "Activar",
  "Enable after validation": "Activar tras validar",
  "Enable external alerts if needed.":
    "Active las alertas externas si es necesario.",
  Enabled: "Activado",
  "English name": "Nombre en inglés",
  "Enter a justification of at least three characters and, when needed, start and expiry. Empty expiry means permanent access. For a group, check members and nested group effects before confirming.":
    "Introduzca una justificación de al menos tres caracteres y, si procede, inicio y caducidad. Sin caducidad, el acceso es permanente. Compruebe miembros y grupos anidados antes de confirmar.",
  "Enter a justification of at least three characters.":
    "Introduzca una justificación de al menos tres caracteres.",
  "Enter at least two characters.": "Introduzca al menos dos caracteres.",
  "Enter content and select audience groups.":
    "Introduzca el contenido y seleccione los grupos destinatarios.",
  "Enter language, space, category, title and description; for a new file, add the change summary.":
    "Introduzca idioma, espacio, categoría, título y descripción; para un archivo nuevo, añada el resumen de cambios.",
  "Enter server, port, search base and service account.":
    "Introduzca servidor, puerto, base de búsqueda y cuenta de servicio.",
  "Enter the address and available credentials; check network access.":
    "Introduzca la dirección y las credenciales disponibles; compruebe el acceso de red.",
  "Enter the available information and logo.":
    "Introduzca la información disponible y el logotipo.",
  "Enter your credentials to access your documents.":
    "Introduzca sus credenciales para acceder a sus documentos.",
  "Entra ID configuration": "Configuración de Entra ID",
  "Entra application": "Aplicación Entra",
  "Entra mode": "Modo Entra",
  Error: "Error",
  "Every detected member of this group will receive full administrator rights.":
    "Cada miembro detectado de este grupo recibirá derechos completos de administrador.",
  "Example values and commands": "Valores y comandos de ejemplo",
  "Exception register": "Registro de excepciones",
  "Expand viewer": "Ampliar visor",
  Expired: "Caducado",
  Expires: "Caduca",
  "Expires ": "Caduca ",
  Expiry: "Caducidad",
  "Explain rejection": "Explicar el rechazo",
  "Export CSV": "Exportar CSV",
  "Export JSON": "Exportar JSON",
  "Export dated CSV": "Exportar CSV fechado",
  "Export only when necessary and protect the file.":
    "Exporte solo cuando sea necesario y proteja el archivo.",
  "Export signed snapshot": "Exportar instantánea firmada",
  "External collection unverified": "Recepción externa no verificada",
  Failed: "Fallido",
  File: "Archivo",
  "File language": "Idioma del archivo",
  "Filter administrators": "Filtrar administradores",
  "Filter and sort": "Filtrar y ordenar",
  "Filter reviews": "Filtrar revisiones",
  "Final state": "Estado final",
  "Find a document": "Buscar un documento",
  "Find a menu": "Buscar un menú",
  "Find the event around the time of the issue.":
    "Busque el evento alrededor de la hora del problema.",
  "Find the portal’s essential features and immediately verify your access.":
    "Consulte las funciones esenciales del portal y verifique inmediatamente su acceso.",
  "Find your documents, requests and preferences.":
    "Encuentre sus documentos, solicitudes y preferencias.",
  "First configure and test the channel in Alert channels. In Alert policy, select that channel, enable and save the policy. Enabling without a working destination guarantees no delivery.":
    "Configure y pruebe primero el canal en Canales de alerta. Selecciónelo en Política de alertas, active y guarde la política. Activarla sin un destino operativo no garantiza ningún envío.",
  "First select an AD group from the results.":
    "Seleccione primero un grupo AD de los resultados.",
  "First select an AD user from the results.":
    "Seleccione primero un usuario AD de los resultados.",
  "Fit to width": "Ajustar al ancho",
  "Fit whole page": "Ajustar página completa",
  "For LDAPS, verify the server name, certificate and trust chain. Review synchronization errors if groups or members are missing. Do not disable TLS validation to hide a certificate error.":
    "Para LDAPS, compruebe el nombre del servidor, el certificado y la cadena de confianza. Revise los errores si faltan grupos o miembros. No desactive TLS para ocultar un error de certificado.",
  "For a local administrator, use the form with current and new passwords. For AD/Entra, change the password through the directory or identity provider, not by creating an equivalent local password.":
    "Para un administrador local, use el formulario con las contraseñas actual y nueva. Para AD/Entra, cambie la contraseña mediante el directorio o proveedor de identidad, no creando una contraseña local equivalente.",
  "For an outage, open Service health. For processing delays or missing email, open Observability. To change a recipient or threshold, use Alert channels or Alert policy.":
    "Para una interrupción, abra Salud de servicios. Para retrasos o correos ausentes, abra Observabilidad. Para cambiar destinatario o umbral, use Canales de alerta o Política de alertas.",
  "For viewing access, select Show menu, Read, Search and Preview. Leave Download and management permissions unchecked. Add a justification and save.":
    "Para consultar, seleccione Mostrar menú, Leer, Buscar y Vista previa. Deje desmarcadas Descarga y gestión. Añada una justificación y guarde.",
  Framework: "Marco",
  French: "Francés",
  "French name": "Nombre en francés",
  "Frequent actions": "Acciones frecuentes",
  "Friendly name": "Nombre descriptivo",
  "Full year": "Año completo",
  "Go directly to the main ISMS management areas.":
    "Acceda directamente a las principales áreas de gestión ISMS.",
  "Governance sections": "Secciones de gobernanza",
  "Grant only necessary capabilities and check any category restrictions. Reading and downloading are independent. Temporary access, anomalies and snapshots are tracked in access governance tools.":
    "Conceda solo los permisos necesarios y compruebe las restricciones de categoría. Lectura y descarga son independientes. La gobernanza de accesos registra accesos temporales, anomalías e instantáneas.",
  "Granted permissions": "Permisos concedidos",
  Group: "Grupo",
  "Group attribute": "Atributo de grupo",
  "Group deleted.": "Grupo eliminado.",
  "Group filter": "Filtro de grupos",
  "Group imported from Active Directory.":
    "Grupo importado de Active Directory.",
  "Group name": "Nombre del grupo",
  "Group pagination": "Paginación de grupos",
  "Grouped publication summary": "Resumen agrupado de publicaciones",
  "Groups found in Active Directory": "Grupos encontrados en Active Directory",
  "Groups recognized by the application":
    "Grupos reconocidos por la aplicación",
  "Groups to resynchronize": "Grupos para resincronizar",
  Guides: "Guías",
  "HTTPS webhook URL": "URL HTTPS del webhook",
  Help: "Ayuda",
  "Help topics": "Temas de ayuda",
  "Hide navigation": "Ocultar navegación",
  "Hide submenus": "Ocultar submenús",
  High: "Alta",
  "High contrast": "Alto contraste",
  History: "Historial",
  Home: "Inicio",
  "IDs and secret": "Identificadores y secreto",
  IN_REVIEW: "EN_REVISIÓN",
  "IP address": "Dirección IP",
  "ISMS Administrator": "Administrador ISMS",
  "ISMS Portal help": "Ayuda de ISMS Portal",
  "ISMS governance": "Gobernanza ISMS",
  "ISMS help center": "Centro de ayuda ISMS",
  "ISMS response:": "Respuesta ISMS:",
  Identifier: "Identificador",
  "Identify the document and confirm the intended action.":
    "Identifique el documento y confirme la acción prevista.",
  "Identify the exact key and its expected effect.":
    "Identifique la clave exacta y su efecto esperado.",
  "Identify the failing dependency and review its technical logs.":
    "Identifique la dependencia en fallo y consulte sus registros técnicos.",
  "Identify the issuer of the directory certificate.":
    "Identifique el emisor del certificado del directorio.",
  "Identify the period, user and resource to examine.":
    "Identifique el periodo, usuario y recurso que desea examinar.",
  Identity: "Identidad",
  "Identity and sign-in": "Identidad e inicio de sesión",
  "Identity source": "Origen de la identidad",
  "If MFA is offered, complete activation and retain recovery methods.":
    "Si se ofrece MFA, complete su activación y conserve los métodos de recuperación.",
  "If email is missing: check recipients, job queue, provider errors and mail filtering.":
    "Si falta el correo: compruebe destinatarios, cola de tareas, errores del proveedor y filtros de correo.",
  "If export is necessary, limit it to the authorized period and purpose. Store it in a protected location with required retention, and compare the result with actual resource state.":
    "Si necesita exportar, limite el periodo y la finalidad autorizados. Guarde el archivo en un lugar protegido con la conservación necesaria y compare el resultado con el estado real del recurso.",
  "If membership comes through a nested group, enable nested group resolution in the connector and test the result. Sign the test account in again to verify effective permissions.":
    "Si la pertenencia procede de un grupo anidado, active su resolución en el conector y pruebe el resultado. Vuelva a conectar la cuenta de prueba para verificar los permisos efectivos.",
  "If no members appear, check the LDAP scope and latest synchronization.":
    "Si no aparecen miembros, compruebe el ámbito LDAP y la última sincronización.",
  "If unsuccessful: check DNS, connectivity, certificate, DN and service account permissions.":
    "Si falla: compruebe DNS, conectividad, certificado, DN y permisos de la cuenta de servicio.",
  Implemented: "Implementado",
  "Implemented controls": "Controles implementados",
  "Implicit TLS (port 465)": "TLS implícito (puerto 465)",
  Import: "Importar",
  "Import a batch": "Importar un lote",
  "Import progress": "Progreso de importación",
  "Import the required CA certificates.":
    "Importe los certificados de CA necesarios.",
  "Important: ": "Importante: ",
  "In Access rules, click Add rule and select the ISMS-IT-Readers group and Information technology space.":
    "En Reglas de acceso, pulse Añadir regla y seleccione el grupo ISMS-IT-Readers y el espacio Informática.",
  "In Active Directory groups, search for the group and check its DN, active state and synchronization date. Then use its entry in an access rule.":
    "En Grupos de Active Directory, busque el grupo y compruebe DN, estado y fecha de sincronización. Utilice después su entrada en una regla de acceso.",
  "In Active Directory groups, verify the synchronized ISMS-IT-Readers group. In Access rules, associate that group with the Information technology space, then test with a standard group member.":
    "En Grupos de Active Directory, verifique el grupo sincronizado ISMS-IT-Readers. Asócielo con el espacio Informática en Reglas de acceso y pruebe con un miembro estándar.",
  "In Active Directory, create an ISMS-IT-Readers security group in the Groups OU and add a standard test account. This operation takes place in the directory, not by creating an ISMS menu.":
    "En Active Directory, cree el grupo de seguridad ISMS-IT-Readers en la OU Groups y añada una cuenta estándar de prueba. Esta operación se realiza en el directorio, no creando un menú ISMS.",
  "In Administrator profile, check your identity and authentication method, then update the available display name and photo. These settings do not change AD groups or administrative privileges.":
    "En Perfil de administrador, compruebe identidad y autenticación; actualice nombre y foto si están disponibles. Estos ajustes no modifican los grupos AD ni los privilegios administrativos.",
  "In Audit log, start with issue time, identity and resource. Apply available filters and examine action, result and timestamp; record a correlation identifier when available.":
    "En Registro de auditoría, empiece por hora, identidad y recurso del problema. Filtre y examine acción, resultado y fecha; anote el identificador de correlación si existe.",
  "In Document spaces, click New space. Enter the French and English names below, then save. The space populates the portal document menu: no new code route is needed.":
    "En Espacios documentales, pulse Nuevo espacio. Introduzca los nombres en francés e inglés y guarde. El espacio aparece en el menú documental del portal: no necesita una ruta de código nueva.",
  "In Document trash, identify the document by title and deletion date. Before restoring, check expected space, categories, permissions and retention policy.":
    "En Papelera documental, identifique título y fecha de eliminación. Antes de restaurar, compruebe espacio previsto, categorías, permisos y política de conservación.",
  "In Documents, select Information technology and its Workstations subcategory, then enter file language, title and description. Upload the file and wait for the antivirus scan result before publishing.":
    "En Documentos, seleccione Informática y su subcategoría Workstations; introduzca idioma, título y descripción. Cargue el archivo y espere el resultado del antivirus antes de publicar.",
  "In Entra, configure the application and the redirect expected by the portal.":
    "En Entra, configure la aplicación y la redirección esperada por el portal.",
  "In Incident reports, prepare the year, available titles and summary. Save as draft first to check information before distribution.":
    "En Informes de incidentes, prepare año, títulos y resumen. Guarde primero un borrador para comprobar la información antes de distribuirla.",
  "In Moderators, select the AD user or group from search results and enter a justification. Check membership before granting the MODERATOR role.":
    "En Cuentas de moderadores, seleccione el usuario o grupo AD de los resultados y justifique el acceso. Compruebe los miembros antes de conceder el rol MODERATOR.",
  "In Portal branding, enter a title of 3 to 60 characters. Choose a valid PNG, JPEG or WebP logo under 20 MiB; the interface resizes and optimizes it before saving.":
    "En Identidad visual, introduzca un título de 3 a 60 caracteres. Elija un logotipo PNG, JPEG o WebP válido inferior a 20 MiB; la interfaz lo redimensiona y optimiza antes de guardarlo.",
  "In Simulate effective permissions, enter the test account identity or expected group and run Simulate. Check permissions on the relevant space.":
    "En Simular permisos efectivos, introduzca la cuenta de prueba o grupo esperado y pulse Simular. Compruebe los permisos del espacio afectado.",
  "In User requests, open the request and check requester, resource, justification, status and date. For an access request, compare the need with the requested group or space and intended duration.":
    "En Solicitudes de usuarios, compruebe solicitante, recurso, justificación, estado y fecha. Compare la necesidad con el grupo o espacio solicitado y la duración prevista.",
  "In progress": "En curso",
  "In review": "En revisión",
  "In the Entra admin center, open App registrations > New registration. Create ISMS Portal SSO for accounts in your organization only. Record the Application (client) ID and Directory (tenant) ID.":
    "En el centro de administración Entra, abra Registros de aplicaciones > Nuevo registro. Cree ISMS Portal SSO solo para su organización. Anote los ID de aplicación (cliente) y directorio (tenant).",
  Inactive: "Inactivo",
  "Incident reports": "Informes de incidentes",
  "Incident reports are temporarily unavailable.":
    "Los informes de incidentes no están disponibles temporalmente.",
  "Incomplete refresh. The last available data is preserved. Try again.":
    "Actualización incompleta. Se conservan los últimos datos disponibles. Inténtelo de nuevo.",
  "Incorrect credentials or MFA code.":
    "Credenciales o código MFA incorrectos.",
  "Incorrect information": "Información incorrecta",
  "Incorrect username or password.": "Identificador o contraseña incorrectos.",
  "Information Security Management System":
    "Sistema de gestión de la seguridad de la información",
  Infrastructure: "Infraestructura",
  "Initial state": "Estado inicial",
  Integrations: "Integraciones",
  "Interface language": "Idioma de la interfaz",
  "Interval (minutes)": "Intervalo (minutos)",
  "Invalid channel configuration.": "Configuración del canal no válida.",
  Investigating: "En investigación",
  "Issue report deleted.": "Reporte de problema eliminado.",
  "Issue reports": "Reportes de problemas",
  "Issue type": "Tipo de problema",
  Issuer: "Emisor",
  "JSON value": "Valor JSON",
  Justification: "Justificación",
  "Justify approval": "Justificar la aprobación",
  "Keep internal comments separate from the response intended for the requester. Annual incident reports have their own menu and an audience that must be checked.":
    "Separe los comentarios internos de la respuesta al solicitante. Los informes anuales de incidentes tienen un menú propio y destinatarios que debe comprobar.",
  "Keep internal notes separate from the message intended for the requester.":
    "Separe las notas internas del mensaje destinado al solicitante.",
  "Keep metrics and secrets protected. Start with thresholds appropriate to observed activity and check received events to avoid repetitive alerts that do not lead to useful action.":
    "Proteja métricas y secretos. Empiece con umbrales adecuados a la actividad observada y compruebe los eventos recibidos para evitar alertas repetitivas que no permitan actuar.",
  Key: "Clave",
  "LDAP / LDAPS directory": "Directorio LDAP / LDAPS",
  "LDAP/LDAPS failures": "Fallos LDAP/LDAPS",
  "LDAP/LDAPS synchronization": "Sincronización LDAP/LDAPS",
  "LDAP: IP address or hostname.": "LDAP: dirección IP o nombre de host.",
  "LDAPS: a fully qualified hostname matching the certificate is required.":
    "LDAPS: se requiere un nombre completo de host que coincida con el certificado.",
  Language: "Idioma",
  Languages: "Idiomas",
  "Last sync": "Última sincronización",
  "Last synchronization": "Última sincronización",
  "Last test: ": "Última prueba: ",
  "Last updated": "Última actualización",
  "Last updated on": "Actualizado el",
  "Last use": "Último uso",
  "Leave blank to keep the current secret":
    "Dejar vacío para conservar el secreto actual",
  "Legal hold": "Retención legal",
  "Lessons learned": "Lecciones aprendidas",
  "Lessons learned and improvement actions":
    "Lecciones aprendidas y acciones de mejora",
  "Lifetime means permanent: no expiry date or automatic recertification deadline. Manual confirmation remains audited.":
    "Permanente significa sin fecha de caducidad ni plazo de recertificación automática. La confirmación manual sigue auditada.",
  "Lifetime — no expiry": "Permanente — sin caducidad",
  "Link copied": "Enlace copiado",
  "Linked administrator account": "Cuenta de administrador asociada",
  List: "Lista",
  "List view": "Vista de lista",
  "Live ISMS platform status.": "Estado real de la plataforma ISMS.",
  "Loading administration…": "Cargando administración…",
  "Loading moderator workspace…": "Cargando el espacio del moderador…",
  "Loading requests…": "Cargando solicitudes…",
  "Loading…": "Cargando…",
  "Local account": "Cuenta local",
  "Local accounts": "Cuentas locales",
  "Local administrator": "Administrador local",
  "Local entry": "Entrada local",
  "Local readiness failed": "Comprobación local de disponibilidad fallida",
  "Local readiness verified": "Disponibilidad local verificada",
  Location: "Ubicación",
  "Logo and labels do not change document file language.":
    "El logotipo y los nombres no cambian el idioma de los archivos documentales.",
  "Logo resized and optimized.": "Logotipo redimensionado y optimizado.",
  "Lost device": "Dispositivo perdido",
  Low: "Baja",
  "MFA authentication": "Autenticación MFA",
  "MFA code": "Código MFA",
  "MFA enabled.": "MFA activado.",
  "MFA managed by identity provider":
    "MFA gestionado por el proveedor de identidad",
  "Main navigation": "Navegación principal",
  Manage: "Gestionar",
  "Manage access": "Gestionar acceso",
  "Manage documents": "Gestionar documentos",
  "Managed documents": "Documentos gestionados",
  "Managed in Entra ID": "Gestionado en Entra ID",
  "Manual entry": "Entrada manual",
  "Manual name or identifier": "Nombre o identificador manual",
  "Mapped groups": "Grupos asociados",
  "Mapped sections": "Secciones asociadas",
  "Mapped spaces": "Espacios asociados",
  "Mark all as seen": "Marcar todo como visto",
  "Mark as read": "Marcar como leído",
  "Mark integration as enabled": "Marcar integración como activada",
  "Matrix saved.": "Matriz guardada.",
  "Maximum 200 files per batch.": "Máximo de 200 archivos por lote.",
  "Maximum audit failure rate (%)": "Tasa máxima de fallos de auditoría (%)",
  Medium: "Media",
  Members: "Miembros",
  Menu: "Menú",
  "Metadata language": "Idioma de los metadatos",
  "Metadata saved.": "Metadatos guardados.",
  "Metadata, languages and versions": "Metadatos, idiomas y versiones",
  "Metrics, security events and notifications serve different purposes. Choose the appropriate flow for Zabbix, Wazuh or your monitoring tool.":
    "Métricas, eventos de seguridad y notificaciones tienen finalidades diferentes. Elija el flujo apropiado para Zabbix, Wazuh o su herramienta de supervisión.",
  "Microsoft Graph: delivery and permissions":
    "Microsoft Graph: envío y permisos",
  "Microsoft SSO sign-in": "Inicio de sesión SSO de Microsoft",
  "Microsoft: LDAPS requirements": "Microsoft: requisitos LDAPS",
  "Microsoft: registering an Entra application":
    "Microsoft: registro de una aplicación Entra",
  "Moderator accounts": "Cuentas de moderadores",
  "Moderator added.": "Moderador añadido.",
  "Moderator group added.": "Grupo de moderadores añadido.",
  "Moderator group permissions updated.":
    "Permisos del grupo de moderadores actualizados.",
  "Moderator group removed.": "Grupo de moderadores retirado.",
  "Moderator permissions updated.": "Permisos del moderador actualizados.",
  "Moderator removed.": "Moderador retirado.",
  "Moderator workspace": "Espacio del moderador",
  Moderators: "Moderadores",
  "Moderators can manage, publish, version, archive and delete documents. They cannot access administrative configuration.":
    "Los moderadores pueden gestionar, publicar, versionar, archivar y eliminar documentos. No tienen acceso a la configuración administrativa.",
  Monitoring: "Supervisión",
  "Monitoring integrations": "Integraciones de supervisión",
  Month: "Mes",
  "Most recent": "Más recientes",
  "Most viewed": "Más consultados",
  "Most viewed documents": "Documentos más consultados",
  "Mounted share under /data/smb": "Recurso compartido montado en /data/smb",
  "My document permissions": "Mis permisos documentales",
  "My favorites": "Mis favoritos",
  "My issue reports": "Mis reportes de problemas",
  "My profile": "Mi perfil",
  "My reading list": "Mi lista de lectura",
  "My workspace": "Mi espacio personal",
  Name: "Nombre",
  "Name or email": "Nombre o correo",
  "Name, identifier, or source": "Nombre, identificador u origen",
  "Name, username or email": "Nombre, identificador o correo",
  "Needs attention": "Pendiente de atención",
  "Nested groups": "Grupos anidados",
  Never: "Nunca",
  "New annual report": "Nuevo informe anual",
  "New batch": "Nuevo lote",
  "New category": "Nueva categoría",
  "New connector": "Nuevo conector",
  "New expiry": "Nueva caducidad",
  "New password (14 characters minimum)":
    "Nueva contraseña (mínimo 14 caracteres)",
  "New rule": "Nueva regla",
  "New space": "Nuevo espacio",
  "New storage": "Nuevo almacenamiento",
  "New version": "Nueva versión",
  "New version replaces document content: select the existing document, upload the new file and describe the changes. Do not create a separate document for a straightforward update of the same content.":
    "Una nueva versión sustituye el contenido documental: seleccione el documento existente, cargue el archivo y describa los cambios. No cree otro documento para una actualización del mismo contenido.",
  "New version uploaded and scanned.": "Nueva versión cargada y analizada.",
  Next: "Siguiente",
  "Next create Postes de travail / Workstations. Select the same space and Procedures as the parent category: this is the subcategory. Upload a document into this category from Documents.":
    "Cree después Postes de travail / Workstations. Seleccione el mismo espacio y Procedures como categoría superior: será la subcategoría. Cargue un documento en ella desde Documentos.",
  "Next document": "Documento siguiente",
  "No AD group found.": "No se encontró ningún grupo AD.",
  "No AD user found.": "No se encontró ningún usuario AD.",
  "No access to Microsoft Graph data":
    "Sin acceso a los datos de Microsoft Graph",
  "No activity.": "Sin actividad.",
  "No annual report.": "Sin informe anual.",
  "No approved review": "Sin revisión aprobada",
  "No authorized document matches your search.":
    "Ningún documento autorizado coincide con su búsqueda.",
  "No category": "Sin categoría",
  "No certificate.": "Sin certificado.",
  "No change.": "Sin cambios.",
  "No comment was provided.": "No se ha proporcionado ningún comentario.",
  "No connector.": "Sin conector.",
  "No deadline": "Sin fecha límite",
  "No deleted documents.": "No hay documentos eliminados.",
  "No document issue report.": "No hay reportes de problemas documentales.",
  "No document management right is assigned.":
    "No se ha asignado ningún derecho de gestión documental.",
  "No dormant account.": "No hay cuentas inactivas.",
  "No expiry": "Sin caducidad",
  "No file is available in this language.":
    "No hay archivo disponible en este idioma.",
  "No justification": "Sin justificación",
  "No managed document on this page.":
    "No hay documentos gestionados en esta página.",
  "No matching administrator.": "Ningún administrador coincide.",
  "No matching menu": "No se encontró ningún menú",
  "No matching requests.": "No hay solicitudes coincidentes.",
  "No moderator configured.": "No hay moderadores configurados.",
  "No notification.": "Sin notificaciones.",
  "No optional storage configured.":
    "No hay almacenamiento opcional configurado.",
  "No owner": "Sin propietario",
  "No published report": "Sin informe publicado",
  "No request": "Sin solicitud",
  "No request.": "Sin solicitud.",
  "No results": "Sin resultados",
  "No reviews in this view.": "No hay revisiones en esta vista.",
  "No saved search.": "Sin búsquedas guardadas.",
  "No topics match this search.": "Ningún tema coincide con esta búsqueda.",
  None: "Ninguno",
  "None (LDAP only)": "Ninguno (solo LDAP)",
  "None — root category": "Ninguna — categoría raíz",
  "Not all settings belong on this screen. Do not enable multiple channels or collectors to fix a delayed counter; identify the cause first.":
    "No todos los ajustes pertenecen a esta pantalla. No active varios canales o recopiladores para corregir un contador retrasado; identifique primero la causa.",
  "Not applicable": "No aplicable",
  "Not implemented": "No implementado",
  "Not provided": "No proporcionado",
  "Not provided by the SSO provider": "No proporcionado por el proveedor SSO",
  "Not tested": "No probado",
  Notifications: "Notificaciones",
  Observability: "Observabilidad",
  "Occurred at": "Ocurrido el",
  "Only groups searched for and added here are retained and refreshed during synchronization.":
    "Solo los grupos buscados y añadidos aquí se conservan y actualizan durante la sincronización.",
  "Only identifies the language of the file.":
    "Indica únicamente el idioma del archivo.",
  "Only the primary administrator can grant or revoke these rights. An AD user or group member receives full administrator rights only after successful authentication.":
    "Solo el administrador principal puede conceder o revocar estos derechos. Un usuario AD o miembro del grupo obtiene todos los derechos de administrador únicamente tras autenticarse correctamente.",
  Open: "Abrir",
  "Open an incident": "Abrir un incidente",
  "Open attached evidence": "Abrir pruebas adjuntas",
  "Open document": "Abrir documento",
  "Open exceptions": "Abrir excepciones",
  "Open in a new tab": "Abrir en una pestaña nueva",
  "Open issue processing": "Abrir tratamiento de problemas",
  "Open items requiring action in their menu.":
    "Abra los elementos pendientes en su menú.",
  "Open menu": "Abrir menú",
  "Open my favorites": "Abrir mis favoritos",
  "Open navigation": "Abrir navegación",
  "Open section": "Abrir sección",
  "Open the document and check language, version, classification and permissions. For a batch, review every failure.":
    "Abra el documento y compruebe idioma, versión, clasificación y permisos. En un lote, examine cada fallo.",
  "Open the request and check identity, document and reason.":
    "Abra la solicitud y compruebe identidad, documento y motivo.",
  Operation: "Operación",
  "Operation failed": "La operación ha fallado",
  Operations: "Operaciones",
  "Optimizing…": "Optimizando…",
  "Optional expiry": "Caducidad opcional",
  "Optional expiry (empty = permanent)":
    "Caducidad opcional (vacía = permanente)",
  "Optional start": "Inicio opcional",
  "Optional start (empty = immediate)": "Inicio opcional (vacío = inmediato)",
  "Optional storage is unavailable.":
    "El almacenamiento opcional no está disponible.",
  "Optional supporting evidence": "Prueba justificativa opcional",
  "Organize documents by space, then by category.":
    "Organice los documentos por espacio y después por categoría.",
  "Organize your work": "Organice su trabajo",
  Other: "Otro",
  "Other issue": "Otro problema",
  "Outdated document": "Documento desactualizado",
  "Overall resolution": "Resolución global",
  Overdue: "Atrasadas",
  "Overdue reviews": "Revisiones atrasadas",
  Overview: "Vista general",
  "Overview and roles": "Vista general y roles",
  Owner: "Propietario",
  "PDF viewer controls": "Controles del visor PDF",
  "PDF, DOCX, XLSX files · up to 200 · 50 MB per file":
    "Archivos PDF, DOCX, XLSX · hasta 200 · 50 MB por archivo",
  "PDF, PNG, JPEG or TXT, 10 MB maximum. Antivirus scanning is mandatory.":
    "PDF, PNG, JPEG o TXT, máximo 10 MB. El análisis antivirus es obligatorio.",
  "PDF, Word and Excel open read-only. Download and management actions remain independent according to your permissions.":
    "PDF, Word y Excel se abren en solo lectura. La descarga y las acciones de gestión son independientes según sus permisos.",
  "PNG or JPEG, 2 MB maximum.": "PNG o JPEG, máximo 2 MB.",
  Page: "Página",
  "Page center": "Centro de página",
  "Page footer": "Pie de página",
  "Page header": "Encabezado de página",
  "Parent category (optional)": "Categoría superior (opcional)",
  Partial: "Parcial",
  "Partially implemented": "Parcialmente implementado",
  Password: "Contraseña",
  Pending: "Pendiente",
  "Pending drafts": "Borradores pendientes",
  Period: "Periodo",
  "Permanent access confirmed": "Acceso permanente confirmado",
  "Permanently delete all user requests, issue reports and their notifications?":
    "¿Eliminar definitivamente todas las solicitudes, reportes de problemas y sus notificaciones?",
  "Permanently delete this document and all its files?":
    "¿Eliminar definitivamente este documento y todos sus archivos?",
  "Permanently delete this document and its files?":
    "¿Eliminar definitivamente este documento y sus archivos?",
  "Permanently delete this empty space":
    "Eliminar definitivamente este espacio vacío",
  "Permanently delete this issue report?":
    "¿Eliminar definitivamente este reporte de problema?",
  "Permissions and groups refreshed.": "Permisos y grupos actualizados.",
  "Permissions can come from several groups. An administrator retains privileges: that account is not a valid test of a user restriction. Simulation does not replace an actual sign-in test.":
    "Los permisos pueden proceder de varios grupos. Un administrador conserva sus privilegios y no es válido para probar una restricción de usuario. La simulación no sustituye un inicio de sesión real.",
  "Personal workspace sections": "Secciones del espacio personal",
  Pilot: "Piloto",
  "Pin documents in My favorites. A favorite that is no longer authorized is automatically hidden.":
    "Añada sus documentos a Mis favoritos. Un favorito que deje de estar autorizado se ocultará automáticamente.",
  Planned: "Planificada",
  Policies: "Políticas",
  "Policy breach": "Incumplimiento de políticas",
  "Portal address detected automatically":
    "Dirección del portal detectada automáticamente",
  "Portal logo": "Logotipo del portal",
  "Portal preview": "Vista previa del portal",
  "Portal title": "Título del portal",
  "Portal visual identity": "Identidad visual del portal",
  "Prefix (optional)": "Prefijo (opcional)",
  "Preparing preview…": "Preparando vista previa…",
  Preview: "Vista previa",
  "Preview changes": "Vista previa de cambios",
  "Preview impact": "Vista previa del impacto",
  "Preview limited to the first file data.":
    "Vista previa limitada a los primeros datos del archivo.",
  Previous: "Anterior",
  "Previous document": "Documento anterior",
  "Previously saved secrets remain masked. A test sends a real message through the selected channel.":
    "Los secretos ya guardados siguen ocultos. Una prueba envía un mensaje real por el canal seleccionado.",
  Primary: "Principal",
  "Primary controller": "Controlador principal",
  "Primary storage": "Almacenamiento principal",
  "Primary storage (default)": "Almacenamiento principal (predeterminado)",
  "Private view": "Vista privada",
  "Private view saved.": "Vista privada guardada.",
  "Privilege justification": "Justificación de privilegios",
  Procedures: "Procedimientos",
  Process: "Procesar",
  "Process batch": "Procesar lote",
  "Process incident": "Procesar incidente",
  "Processing…": "Procesando…",
  "Profile photo": "Foto de perfil",
  "Profile saved.": "Perfil guardado.",
  "Prometheus metrics are available on the private API network.":
    "Las métricas Prometheus están disponibles en la red privada de la API.",
  "Protected spaces": "Espacios protegidos",
  Protocol: "Protocolo",
  Publication: "Publicación",
  Publish: "Publicar",
  "Publish after scanning": "Publicar después del análisis",
  Published: "Publicado",
  "Published documents": "Documentos publicados",
  "Published version": "Versión publicada",
  "Published years": "Años publicados",
  Publishing: "Publicación",
  "Purge AD data": "Purgar datos AD",
  "Purge all synchronized groups and their access rules? This action does not modify Active Directory.":
    "¿Purgar todos los grupos sincronizados y sus reglas de acceso? Esta acción no modifica Active Directory.",
  Quarantined: "En cuarentena",
  "Quarantined documents": "Documentos en cuarentena",
  "Quickly find the documents relevant to you.":
    "Encuentre rápidamente los documentos que le interesan.",
  REJECTED: "RECHAZADO",
  REVIEW_DUE: "REVISIÓN_PENDIENTE",
  Reachable: "Accesible",
  "Read and download": "Leer y descargar",
  "Read-only": "Solo lectura",
  "Read-only view": "Vista de solo lectura",
  Reason: "Motivo",
  "Reason for this administrator access":
    "Motivo de este acceso de administrador",
  "Received groups": "Grupos recibidos",
  Recent: "Recientes",
  "Recently published documents": "Documentos publicados recientemente",
  "Recently viewed": "Consultados recientemente",
  "Recertification required": "Recertificación necesaria",
  Recertify: "Recertificar",
  "Recertify in 1 year": "Recertificar en 1 año",
  "Recipients (comma-separated)": "Destinatarios (separados por comas)",
  "Record the justified decision and permitted evidence, then check the next due date.":
    "Registre la decisión justificada y las pruebas permitidas; compruebe después la próxima fecha límite.",
  "Record the time, action and affected section, then send these details to your administrator without including a password.":
    "Anote hora, acción y sección afectada; envíe estos datos a su administrador sin incluir contraseñas.",
  "Redirect URL": "URL de redirección",
  "Reduce motion": "Reducir animaciones",
  Reference: "Referencia",
  Refresh: "Actualizar",
  "Refresh Service health and identify the failing dependency: database, Redis, antivirus, storage or application service. Record the time and readiness result before intervening.":
    "Actualice Salud de servicios e identifique la dependencia en fallo: base de datos, Redis, antivirus, almacenamiento o aplicación. Anote la hora y el resultado de disponibilidad antes de intervenir.",
  "Refresh my access": "Actualizar mis permisos",
  "Refresh operational signals, work items and email history. Search the resource and issue time instead of immediately changing a channel.":
    "Actualice señales operativas, tareas e historial de correo. Busque el recurso y la hora del problema antes de cambiar un canal.",
  "Refresh service status.": "Actualice el estado de los servicios.",
  "Refresh signals, the work queue and email history.":
    "Actualice las señales, la cola de trabajo y el historial de correos.",
  "Refresh the dashboard and record the measurement time. Compare documents, requests and reviews with their lists: a counter describes a state, not proof of correct operation.":
    "Actualice el panel y anote la hora de medición. Compare documentos, solicitudes y revisiones con sus listas: un contador describe un estado, no demuestra el funcionamiento correcto.",
  "Refresh the indicators.": "Actualice los indicadores.",
  Refreshing: "Actualizando",
  "Refreshing in background…": "Actualizando en segundo plano…",
  "Refreshing…": "Actualizando…",
  Region: "Región",
  Reject: "Rechazar",
  "Reject this request?": "¿Rechazar esta solicitud?",
  Rejected: "Rechazada",
  "Remember this device for 14 days":
    "Recordar este dispositivo durante 14 días",
  Remove: "Retirar",
  "Remove administrator rights from this AD group?":
    "¿Retirar los derechos de administrador de este grupo AD?",
  "Remove documents, categories and access rules first.":
    "Elimine primero documentos, categorías y reglas de acceso.",
  "Remove from favorites": "Quitar de favoritos",
  "Remove logo": "Eliminar logotipo",
  "Report a security event": "Reportar un evento de seguridad",
  "Report an issue": "Reportar un problema",
  "Report sent to the ISMS team.": "Reporte enviado al equipo ISMS.",
  "Reports will appear here after an administrator publishes them.":
    "Los informes aparecerán aquí cuando un administrador los publique.",
  "Request additional access": "Solicitar acceso adicional",
  "Request destruction": "Solicitar destrucción",
  "Request pagination": "Paginación de solicitudes",
  "Request rejected": "Solicitud rechazada",
  "Request sent.": "Solicitud enviada.",
  "Requested by": "Solicitado por",
  "Requested permissions": "Permisos solicitados",
  Requests: "Solicitudes",
  "Requests and reports": "Solicitudes y reportes",
  "Requests, reports, and governance events automatically use SMTP. If delivery fails or SMTP is not configured, ISMS tries Teams, then Slack, then the generic webhook.":
    "Solicitudes, reportes y eventos de gobernanza utilizan SMTP automáticamente. Si el envío falla o SMTP no está configurado, ISMS prueba Teams, después Slack y finalmente el webhook genérico.",
  Reset: "Restablecer",
  Resolution: "Resolución",
  "Resolution comment": "Comentario de resolución",
  "Resolution rate": "Tasa de resolución",
  "Resolution response": "Respuesta de resolución",
  "Resolve the cause and check the relevant jobs or deliveries.":
    "Resuelva la causa y compruebe las tareas o envíos afectados.",
  "Resolve with comment": "Resolver con comentario",
  Resolved: "Resuelta",
  "Resolved incidents": "Incidentes resueltos",
  Resource: "Recurso",
  Restore: "Restaurar",
  "Restore viewer": "Restaurar visor",
  "Restricted access to portal administration.":
    "Acceso restringido a la administración del portal.",
  Result: "Resultado",
  "Result pages": "Páginas de resultados",
  "Retain functioning fallback access and do not remove the last administrator.":
    "Conserve un acceso alternativo operativo y no elimine al último administrador.",
  "Retain records according to your internal policy.":
    "Conserve los registros según su política interna.",
  "Retain the previous value before making a change. Never include secrets in screenshots or shared exports.":
    "Conserve el valor anterior antes de modificarlo. Nunca incluya secretos en capturas ni exportaciones compartidas.",
  "Retain the previous value; validate the offered value and format.":
    "Conserve el valor anterior; valide el valor y formato disponibles.",
  "Retain until": "Conservar hasta",
  "Retention policy": "Política de conservación",
  "Retest the LDAPS connection.": "Vuelva a probar la conexión LDAPS.",
  "Retest the user operation after recovery.":
    "Vuelva a probar la operación del usuario tras la recuperación.",
  Retries: "Reintentos",
  Retry: "Reintentar",
  "Retry summary": "Resumen de reintentos",
  "Retrying can create a duplicate if the first message was accepted. Email history is not the complete audit log and does not replace Microsoft 365 or SMTP delivery logs.":
    "Reintentar puede duplicar un mensaje ya aceptado. El historial de correos no es toda la auditoría ni sustituye los registros de entrega de Microsoft 365 o SMTP.",
  "Review due": "Revisión pendiente",
  "Review management queue": "Cola de gestión de revisiones",
  "Review the document and record your decision.":
    "Revise el documento y registre su decisión.",
  Reviewer: "Revisor",
  "Reviews and ISMS governance": "Revisiones y gobernanza ISMS",
  "Reviews, permanent access, compliance, retention, identity and incident handling.":
    "Revisiones, accesos permanentes, cumplimiento, conservación, identidad y tratamiento de incidentes.",
  Revoke: "Revocar",
  "Root cause": "Causa raíz",
  "Rule editor": "Editor de reglas",
  "Rule pagination": "Paginación de reglas",
  "Rule saved and applied immediately.":
    "Regla guardada y aplicada inmediatamente.",
  "S3 endpoint (HTTPS)": "Endpoint S3 (HTTPS)",
  "SMTP password": "Contraseña SMTP",
  "SMTP port": "Puerto SMTP",
  "SMTP server": "Servidor SMTP",
  "SMTP username": "Identificador SMTP",
  "SSO connected": "SSO conectado",
  "SSO or your directory session detects your groups. Refresh access after an Active Directory change.":
    "El SSO o su sesión de directorio detecta sus grupos. Actualice los permisos tras un cambio en Active Directory.",
  "SSO proxy": "Proxy SSO",
  "SSO sign-in": "Inicio de sesión SSO",
  "Safe SSO diagnostics": "Diagnósticos SSO seguros",
  "Safe attachment (optional)": "Adjunto seguro (opcional)",
  "Safe bulk operation": "Operación masiva segura",
  Save: "Guardar",
  "Save and check both languages.": "Guarde y compruebe ambos idiomas.",
  "Save and monitor the first events.":
    "Guarde y supervise los primeros eventos.",
  "Save and run Test connection: the test writes, reads and deletes a test object. Use the target only after success. Then upload a test file to that target and check preview and authorized download.":
    "Guarde y pulse Probar conexión: la prueba escribe, lee y elimina un objeto de prueba. Use el destino solo tras el éxito. Cargue después un archivo de prueba y compruebe vista previa y descarga autorizada.",
  "Save and send a Slack alert": "Guardar y enviar una alerta Slack",
  "Save and send a Teams alert": "Guardar y enviar una alerta Teams",
  "Save and send a test email": "Guardar y enviar un correo de prueba",
  "Save and test webhook": "Guardar y probar webhook",
  "Save and test with an account belonging to the group.":
    "Guarde y pruebe con una cuenta del grupo.",
  "Save changes": "Guardar cambios",
  "Save channels": "Guardar canales",
  "Save in bulk": "Guardar en lote",
  "Save report": "Guardar informe",
  "Save search": "Guardar búsqueda",
  "Save view": "Guardar vista",
  "Save, then test with an authorized destination.":
    "Guarde y pruebe con un destino autorizado.",
  "Save, then verify behavior; restore the previous value if a regression occurs.":
    "Guarde y compruebe el comportamiento; restaure el valor anterior si aparece una regresión.",
  "Save, then verify visibility for that audience.":
    "Guarde y verifique la visibilidad para esos destinatarios.",
  "Saved searches": "Búsquedas guardadas",
  "Saved successfully.": "Guardado correctamente.",
  "Saving…": "Guardando…",
  Scanning: "Analizando",
  "Schedule a review": "Programar una revisión",
  "Schedule the next review in one year":
    "Programar la próxima revisión dentro de un año",
  Search: "Buscar",
  "Search AD (e.g. Skill) or enter a DN":
    "Buscar en AD (ej.: Skill) o introducir un DN",
  "Search Active Directory": "Buscar en Active Directory",
  "Search directory": "Buscar en el directorio",
  "Search documents": "Buscar documentos",
  "Search for a policy, procedure or guide…":
    "Buscar una política, un procedimiento o una guía…",
  "Search for an AD group": "Buscar un grupo AD",
  "Search for an Active Directory user":
    "Buscar un usuario de Active Directory",
  "Search for or enter the AD group DN":
    "Buscar o introducir el DN del grupo AD",
  "Search for the group or enter its exact DN.":
    "Busque el grupo o introduzca su DN exacto.",
  "Search help": "Buscar en la ayuda",
  "Search name": "Buscar nombre",
  "Search or select an AD group…": "Buscar o seleccionar un grupo AD…",
  "Search results": "Resultados de búsqueda",
  "Search the directory and select a group to import it, or enter its DN reference. Only groups added to the portal are tracked. Check the source, member count, state and latest synchronization.":
    "Busque el grupo en el directorio y selecciónelo para importarlo, o introduzca su DN. Solo se supervisan los grupos añadidos al portal. Compruebe origen, miembros, estado y última sincronización.",
  "Search this section…": "Buscar en esta sección…",
  "Search, open or download only documents authorized by your Active Directory groups.":
    "Busque, abra o descargue únicamente documentos autorizados por sus grupos de Active Directory.",
  Searches: "Búsquedas",
  "Searching Active Directory…": "Buscando en Active Directory…",
  "Searching…": "Buscando…",
  "Second approval": "Segunda aprobación",
  "Secondary controller": "Controlador secundario",
  Section: "Sección",
  "Secure administration": "Administración segura",
  "Secured by Active Directory": "Protegido por Active Directory",
  Select: "Seleccionar",
  "Select a group and a space.": "Seleccione un grupo y un espacio.",
  "Select an Active Directory group.":
    "Seleccione un grupo de Active Directory.",
  "Select an Active Directory user.":
    "Seleccione un usuario de Active Directory.",
  "Select authorized groups in the audience. Use a dedicated security group for sensitive reports; verify the AD connector has synchronized that group and members.":
    "Seleccione los grupos autorizados como destinatarios. Use un grupo de seguridad específico para informes sensibles y compruebe que el conector AD haya sincronizado el grupo y sus miembros.",
  "Select only necessary capabilities; check category restrictions.":
    "Seleccione solo los permisos necesarios; compruebe las restricciones de categoría.",
  "Select the desired management account or group.":
    "Seleccione la cuenta o grupo de gestión deseado.",
  "Select the group and space in a new rule.":
    "Seleccione el grupo y espacio en una regla nueva.",
  "Select the imported CA, use LDAPS and port 636. Check attributes: sAMAccountName for login, mail for username and email, cn for groups. The mail attribute must be populated if you retain these values.":
    "Seleccione la CA importada, LDAPS y puerto 636. Compruebe atributos: sAMAccountName para conexión, mail para identificador y correo, cn para grupos. El atributo mail debe estar informado si usa estos valores.",
  "Select the integration and expected flow: metrics or events.":
    "Seleccione la integración y el flujo esperado: métricas o eventos.",
  "Select the result and add the group.":
    "Seleccione el resultado y añada el grupo.",
  "Select the space, category, actual file language, title and description. Add the PDF, DOCX or XLSX file and change summary. Uploads undergo antivirus scanning; check the result before publication.":
    "Seleccione espacio, categoría, idioma real del archivo, título y descripción. Añada PDF, DOCX o XLSX y resumen de cambios. Las cargas se analizan con antivirus; compruebe el resultado antes de publicar.",
  "Select the view: reviews, controls, retention, exceptions or incidents.":
    "Seleccione la vista: revisiones, controles, conservación, excepciones o incidentes.",
  "Selected AD user": "Usuario AD seleccionado",
  "Selected document": "Documento seleccionado",
  "Select…": "Seleccionar…",
  "Send report": "Enviar reporte",
  "Sender address": "Dirección del remitente",
  "Sending test…": "Enviando prueba…",
  "Sending…": "Enviando…",
  "Sensitive approvals": "Aprobaciones sensibles",
  "Sensitive content": "Contenido sensible",
  "Sensitive document": "Documento sensible",
  "Sensitive documents": "Documentos sensibles",
  "Service account secret": "Secreto de la cuenta de servicio",
  "Service health": "Salud de servicios",
  "Service temporarily unavailable. Try again.":
    "Servicio temporalmente no disponible. Inténtelo de nuevo.",
  "Session diagnostics": "Diagnósticos de sesión",
  "Session expired": "Sesión caducada",
  "Session expiry": "Caducidad de la sesión",
  "Set up MFA": "Configurar MFA",
  "Setting saved.": "Ajuste guardado.",
  Settings: "Configuración",
  Severity: "Gravedad",
  "Shared description (optional)": "Descripción compartida (opcional)",
  "Short-login attribute": "Atributo del identificador corto",
  "Show all": "Mostrar todo",
  "Show navigation": "Mostrar navegación",
  "Show password": "Mostrar contraseña",
  "Show submenus": "Mostrar submenús",
  "Sign in": "Iniciar sesión",
  "Sign in again": "Volver a iniciar sesión",
  "Sign in again to continue administration.":
    "Vuelva a iniciar sesión para continuar con la administración.",
  "Sign in as a standard group member: the menu and preview should be accessible, while download and editing are denied. Also check a non-member account with no other rule granting this access.":
    "Conecte un miembro estándar: menú y vista previa deben ser accesibles; descarga y edición, denegadas. Compruebe también una cuenta ajena al grupo sin otra regla que conceda acceso.",
  "Sign in to administration": "Iniciar sesión en la administración",
  "Sign out": "Cerrar sesión",
  "Sign out from SSO": "Cerrar sesión SSO",
  "Sign the account in at /moderator. Test granted actions and denial of ungranted actions, then verify it cannot open administrative configuration. Uploads and new versions retain an audit record.":
    "Conecte la cuenta en /moderator. Pruebe acciones concedidas y denegadas y compruebe que no pueda abrir configuración administrativa. Cargas y nuevas versiones conservan un registro de auditoría.",
  "Sign-in and permissions": "Inicio de sesión y permisos",
  "Sign-in source": "Origen de la conexión",
  "Sign-in status": "Estado de la conexión",
  "Signals requiring administrative review.":
    "Señales que requieren revisión administrativa.",
  "Signed access history": "Historial de accesos firmado",
  "Signing in…": "Iniciando sesión…",
  Simulate: "Simular",
  "Simulate effective access": "Simular acceso efectivo",
  "Slack webhook URL": "URL del webhook Slack",
  "Snapshot label": "Nombre de la instantánea",
  "Sort by": "Ordenar por",
  Source: "Origen",
  Space: "Espacio",
  "Space owners": "Propietarios de espacios",
  Spaces: "Espacios",
  "Spaces and categories": "Espacios y categorías",
  "Space…": "Espacio…",
  "Stale groups": "Grupos desactualizados",
  "Standard documents": "Documentos estándar",
  "Statement of applicability": "Declaración de aplicabilidad",
  Status: "Estado",
  "Status filter": "Filtro de estado",
  "Status unavailable": "Estado no disponible",
  "Still experiencing a problem?": "¿El problema persiste?",
  Storage: "Almacenamiento",
  "Storage and architecture": "Almacenamiento y arquitectura",
  "Storage type": "Tipo de almacenamiento",
  "Strong password": "Contraseña segura",
  Subject: "Asunto",
  Submit: "Enviar",
  Success: "Éxito",
  "Summary queued for delivery.": "Resumen en cola de envío.",
  Synchronization: "Sincronización",
  "Synchronization errors": "Errores de sincronización",
  "Synchronization in progress…": "Sincronización en curso…",
  Synchronize: "Sincronizar",
  "Synchronize directory": "Sincronizar directorio",
  "Synchronize, then associate access rules.":
    "Sincronice y asocie después las reglas de acceso.",
  "Synchronized AD groups": "Grupos AD sincronizados",
  System: "Sistema",
  "Teams webhook URL": "URL del webhook Teams",
  "Technical example": "Ejemplo técnico",
  "Technical identifier": "Identificador técnico",
  "Technical workshop: step-by-step configuration":
    "Taller técnico: configuración paso a paso",
  "Temporary — expires": "Temporal — caduca",
  Test: "Probar",
  "Test /moderator with a representative moderator account.":
    "Pruebe /moderator con una cuenta representativa de moderador.",
  "Test Entra ID": "Probar Entra ID",
  "Test SSO proxy": "Probar proxy SSO",
  "Test access before removing a previous administrator.":
    "Pruebe el acceso antes de retirar al administrador anterior.",
  "Test alert sent to the configured channel.":
    "Alerta de prueba enviada al canal configurado.",
  "Test alert sent.": "Alerta de prueba enviada.",
  "Test availability and permissions before using the target.":
    "Pruebe disponibilidad y permisos antes de usar el destino.",
  "Test connection": "Probar conexión",
  "Test delivery failed. Check the configuration and logs.":
    "El envío de prueba ha fallado. Compruebe configuración y registros.",
  "Test email sent to the configured recipients.":
    "Correo de prueba enviado a los destinatarios configurados.",
  "Test failed": "Prueba fallida",
  "Test failed. Check the destination, permissions and network connection.":
    "La prueba ha fallado. Compruebe destino, permisos y conexión de red.",
  "Test in progress": "Prueba en curso",
  "Test passed · Inactive": "Prueba correcta · Inactivo",
  "Test passed: write, read and delete.":
    "Prueba correcta: escritura, lectura y eliminación.",
  "Test reading, preview and download separately. An admin account does not validate restrictions.":
    "Pruebe lectura, vista previa y descarga por separado. Una cuenta de administrador no valida las restricciones.",
  "Test the connection, then run synchronization.":
    "Pruebe la conexión y ejecute después la sincronización.",
  "Test the proxy and then the sign-in journey with a pilot user.":
    "Pruebe el proxy y después la conexión con un usuario piloto.",
  "Test, then verify data in the receiving tool.":
    "Pruebe y verifique después los datos en la herramienta receptora.",
  "Testing…": "Probando…",
  "Text size": "Tamaño del texto",
  "The TOTP key is a secret, not a value for a screenshot. Keep verified fallback access before changing password or MFA. If a code is rejected, check device time and use a current code.":
    "La clave TOTP es secreta y no debe aparecer en capturas. Conserve un acceso alternativo verificado antes de cambiar contraseña o MFA. Si un código falla, compruebe la hora del dispositivo y use uno actual.",
  "The administrator session is closed.":
    "La sesión de administrador está cerrada.",
  "The certificate exceeds the 48 KiB size limit.":
    "El certificado supera el límite de 48 KiB.",
  "The dashboard summarizes indicators and items requiring action. Sensitive changes must remain traceable. Permissions are enforced by the API: hiding a button is not an authorization control.":
    "El panel resume indicadores y tareas pendientes. Los cambios sensibles deben ser trazables. La API controla los permisos: ocultar un botón no es un control de autorización.",
  "The document upload failed.": "La carga del documento ha fallado.",
  "The example.test and example.com domains, names and paths below are illustrative. Adapt them to your environment; these examples do not change any configuration.":
    "Los dominios example.test y example.com, nombres y rutas siguientes son ilustrativos. Adáptelos a su entorno; estos ejemplos no modifican ninguna configuración.",
  "The file exceeds 50 MB.": "El archivo supera 50 MB.",
  "The file is empty.": "El archivo está vacío.",
  "The image is automatically resized and compressed before upload.":
    "La imagen se redimensiona y comprime automáticamente antes de cargarla.",
  "The list uses twenty documents per page. Title search covers all pages. Sorting lets you compare latest updates, publication dates or states. The timeline shows key dates and versions.":
    "La lista muestra veinte documentos por página. La búsqueda por título abarca todas las páginas. La ordenación permite comparar actualización, publicación o estado. El historial muestra fechas y versiones.",
  "The log retains operation records. Use it to find an action, its context and its result.":
    "El registro conserva las operaciones. Úselo para encontrar una acción, su contexto y resultado.",
  "The logo must be a valid PNG, JPEG or WebP image smaller than 20 MiB.":
    "El logotipo debe ser un PNG, JPEG o WebP válido inferior a 20 MiB.",
  "The logo must be smaller than 256 KiB.":
    "El logotipo debe ser inferior a 256 KiB.",
  "The photo must be smaller than 256 KiB.":
    "La foto debe ser inferior a 256 KiB.",
  "The report could not be sent.": "No se pudo enviar el reporte.",
  "The report could not be sent. Please try again.":
    "No se pudo enviar el reporte. Inténtelo de nuevo.",
  "The request could not be sent.": "No se pudo enviar la solicitud.",
  "The title and logo are displayed on sign-in, the user portal and administration.":
    "El título y el logotipo aparecen en conexión, portal de usuarios y administración.",
  "The trash does not replace backups. Do not confuse archiving with deletion.":
    "La papelera no sustituye las copias de seguridad. No confunda archivar con eliminar.",
  "This area contains your profile settings and the security options available for your account.":
    "Esta área contiene los ajustes de perfil y las opciones de seguridad disponibles para su cuenta.",
  "This file cannot be displayed.": "No se puede mostrar este archivo.",
  "This justification will be retained with the decision author and date.":
    "Esta justificación se conservará junto con el autor y la fecha de decisión.",
  "This menu groups available monitoring integrations. Configure and test each integration with its receiving service.":
    "Este menú reúne las integraciones de supervisión disponibles. Configure y pruebe cada una con su servicio receptor.",
  "This menu manages annual incident reports and their audience. It is separate from incident and corrective action tracking in ISMS governance.":
    "Este menú gestiona informes anuales de incidentes y sus destinatarios. Es distinto del seguimiento de incidentes y acciones correctivas de la gobernanza ISMS.",
  "This menu manages certificate authorities used for directory connections. Import the appropriate trust chain and check validity dates before testing LDAPS.":
    "Este menú gestiona las autoridades de certificación del directorio. Importe la cadena de confianza adecuada y compruebe las fechas de validez antes de probar LDAPS.",
  "This technical configuration is for settings whose purpose you understand. Prefer a dedicated menu when available.":
    "Esta configuración técnica contiene ajustes cuyo propósito debe conocer. Prefiera un menú dedicado cuando exista.",
  Title: "Título",
  "Title and change summary are required.":
    "El título y el resumen de cambios son obligatorios.",
  "To correct only language, title, description or category, use Edit and save metadata without attaching a new file. To replace content, use New version, attach the file and describe changes.":
    "Para corregir solo idioma, título, descripción o categoría, use Editar y guarde metadatos sin adjuntar otro archivo. Para sustituir contenido, use Nueva versión y describa los cambios.",
  "To read": "Por leer",
  "Too many attempts. Wait before trying again.":
    "Demasiados intentos. Espere antes de volver a intentarlo.",
  Topic: "Tema",
  "Topic navigation": "Navegación de temas",
  Total: "Total",
  "Total incidents": "Total de incidentes",
  "Tracked years": "Años registrados",
  "Trusted certificates": "Certificados de confianza",
  "Try another search or browse a different section.":
    "Pruebe otra búsqueda o consulte otro espacio.",
  Type: "Tipo",
  "UTC events without secrets.": "Eventos UTC sin secretos.",
  "Unable to load requests.": "No se pudieron cargar las solicitudes.",
  "Unable to load requests. Sign in to the portal and try again.":
    "No se pudieron cargar las solicitudes. Conecte al portal e inténtelo de nuevo.",
  "Unable to refresh permissions.": "No se pudieron actualizar los permisos.",
  Unavailable: "No disponible",
  "Unexpected error.": "Error inesperado.",
  Unknown: "Desconocido",
  "Unsupported format: PDF, DOCX or XLSX required.":
    "Formato no admitido: se requiere PDF, DOCX o XLSX.",
  Updated: "Actualizado",
  Upload: "Cargar",
  "Upload a document": "Cargar un documento",
  "Upload a new version": "Cargar una nueva versión",
  "Upload a version": "Cargar una versión",
  "Upload and scan": "Cargar y analizar",
  "Upload new version": "Cargar nueva versión",
  "Uploading and managing documents": "Carga y gestión de documentos",
  Urgency: "Urgencia",
  "Use Restore, then check status, version, preview and portal access. Also check the review queue; do not assume restoration automatically republishes the document or recreates all notifications.":
    "Use Restaurar y compruebe estado, versión, vista previa y acceso al portal. Compruebe también revisiones; no presuponga que restaurar vuelve a publicar o recrea todas las notificaciones.",
  "Use Save and send test email to an authorized test mailbox. This button sends a real message. Check delivery history in Observability and actual receipt, including junk mail and quarantine.":
    "Use Guardar y enviar correo de prueba a un buzón autorizado. El botón envía un mensaje real. Compruebe el historial en Observabilidad y la recepción, incluidos correo no deseado y cuarentena.",
  "Use Test in this menu. Next select this CA in the LDAPS connector and test directory connectivity: importing alone does not enable LDAPS on the domain controller.":
    "Use Probar en este menú. Seleccione después esta CA en el conector LDAPS y pruebe la conectividad: importar el certificado no activa LDAPS en el controlador de dominio.",
  "Use a dedicated menu when available; never share secrets.":
    "Use un menú dedicado cuando exista; nunca comparta secretos.",
  "Use a non-sensitive test document and check viewing as a standard reader. Correlate an issue with its time, resource and audit log before changing configuration.":
    "Use un documento de prueba no sensible y compruebe su lectura con un usuario estándar. Correlacione problema, hora, recurso y auditoría antes de cambiar ajustes.",
  "Use my credentials": "Utilizar mis credenciales",
  "Use proxy diagnostics and tests, then verify sign-in with a pilot user and their documents. Retain a fallback sign-in method. Microsoft authentication does not replace document access rules.":
    "Use diagnósticos y pruebas del proxy; verifique después conexión y documentos con un usuario piloto. Conserve un método alternativo. La autenticación Microsoft no sustituye las reglas documentales.",
  "Use restoration if offered in the trash.":
    "Use la restauración si está disponible en la papelera.",
  "Use search, a section or a category. Format, language and sensitivity filters can be combined and shared through the URL.":
    "Use búsqueda, espacio o categoría. Los filtros de formato, idioma y sensibilidad se combinan y comparten mediante la URL.",
  "Use the header FR/EN buttons to change interface language, including help. Change file language separately in Edit document; a logo or title does not translate document content.":
    "Use FR/EN/ES en el encabezado para cambiar el idioma de la interfaz y la ayuda. Cambie por separado el idioma del archivo en Editar documento; ni logotipo ni título traducen su contenido.",
  "Use the publication, approval, review or report template test with an authorized recipient. This sends real email and does not by itself validate recipient calculation for an actual event.":
    "Pruebe la plantilla de publicación, aprobación, revisión o reporte con un destinatario autorizado. Envía correo real y no valida por sí sola el cálculo de destinatarios del evento.",
  "User comment": "Comentario del usuario",
  "User filter": "Filtro de usuarios",
  "User identity": "Identidad del usuario",
  "User sign-in is temporarily unavailable. Contact your administrator.":
    "El inicio de sesión no está disponible temporalmente. Contacte con su administrador.",
  Username: "Identificador",
  "Username attribute": "Atributo de identificador",
  "Users can request additional permissions and report document issues. Check the requester, resource, reason and scope before accepting or rejecting; a request does not grant access by itself.":
    "Los usuarios pueden solicitar permisos y reportar problemas documentales. Compruebe solicitante, recurso, motivo y ámbito antes de decidir; una solicitud no concede acceso por sí misma.",
  Valid: "Válido",
  "Valid from": "Válido desde",
  "Verify an upload and read, then backups of files and PostgreSQL.":
    "Verifique carga y lectura, y después copias de archivos y PostgreSQL.",
  Version: "Versión",
  View: "Vista",
  "View annual reports published by your administrator.":
    "Consulte los informes anuales publicados por su administrador.",
  "View summary and lessons learned": "Ver resumen y lecciones aprendidas",
  "Visual identity saved.": "Identidad visual guardada.",
  "Watermark position": "Posición de la marca de agua",
  "Watermark preview": "Vista previa de marca de agua",
  Welcome: "Bienvenido",
  "What to check": "Puntos que comprobar",
  "Window view": "Vista de ventanas",
  Windows: "Ventanas",
  "Work item pagination": "Paginación de tareas",
  "Working…": "Trabajando…",
  Year: "Año",
  "You are not allowed to preview this document.":
    "No tiene permiso para previsualizar este documento.",
  "You are now signed out.": "Ha cerrado la sesión.",
  "Your access summary": "Resumen de su acceso",
  "Your decision is required.": "Se requiere su decisión.",
  "Your identity does not have the administrator role.":
    "Su identidad no tiene el rol de administrador.",
  "Your personal reading list is empty.":
    "Su lista personal de lectura está vacía.",
  "Your session has expired.": "Su sesión ha caducado.",
  "Zoom in": "Ampliar",
  "Zoom level": "Nivel de zoom",
  "Zoom out": "Reducir",
  "archive / delete": "archivar / eliminar",
  "authorized document": "documento autorizado",
  "authorized documents": "documentos autorizados",
  categories: "categorías",
  "changed rule(s)": "regla(s) modificada(s)",
  "document storage available": "almacenamiento documental disponible",
  documents: "documentos",
  "domain published by Nginx": "dominio publicado por Nginx",
  edit: "editar",
  "en-GB": "es-ES",
  failed: "fallidos",
  false: "false",
  groups: "grupos",
  help: "ayuda",
  "high-priority alerts": "alertas de alta prioridad",
  "incident(s) selected": "incidente(s) seleccionado(s)",
  "item(s) will move to": "elemento(s) se moverán a",
  "items to review": "elementos pendientes",
  "local-admin": "administrador local",
  "member(s)": "miembro(s)",
  members: "miembros",
  "next version": "próxima versión",
  of: "de",
  publish: "publicar",
  requests: "solicitudes",
  rules: "reglas",
  "server IP address": "dirección IP del servidor",
  space: "espacio",
  spaces: "espacios",
  "spaces without owner": "espacios sin propietario",
  "storage used": "almacenamiento utilizado",
  "· in use": "· en uso",
  "A Graph HTTP 202 means accepted, not received. Do not repeatedly retry an already accepted message. Webhook URLs, passwords and private keys are secrets: never include them in screenshots or examples. A successful SMTP test does not validate Graph, and vice versa.":
    "Un HTTP 202 de Graph significa aceptado, no recibido. No reenvíe repetidamente un mensaje ya aceptado. Las URL de webhook, contraseñas y claves privadas son secretos: nunca los incluya en capturas o ejemplos. Una prueba SMTP correcta no valida Graph, ni a la inversa.",
  "A rule associates a group with a space and distinct capabilities: reading, previewing, downloading or management operations. Filter by group and space to inspect the matrix, then use the group button to open the editor.":
    "Una regla asocia un grupo con un espacio y permisos distintos: lectura, vista previa, descarga o gestión. Filtre por grupo y espacio para examinar la matriz; después use el botón del grupo para abrir el editor.",
  "A send test may transmit a real message. Use an authorized test destination and review delivery history. Provider acceptance does not prove receipt: also check the recipient mailbox and mail filtering.":
    "Una prueba de envío puede transmitir un mensaje real. Use un destino de prueba autorizado y examine el historial. La aceptación del proveedor no demuestra recepción: compruebe también el buzón destinatario y los filtros de correo.",
  "Administrator profile manages personal settings and available security features. Administrator accounts manages accounts, group associations and active sessions. Verify fallback access before removing the last administrator.":
    "Perfil de administrador gestiona ajustes personales y funciones de seguridad disponibles. Cuentas de administradores gestiona cuentas, grupos asociados y sesiones activas. Verifique un acceso alternativo antes de retirar al último administrador.",
  "Advanced settings concerns technical configuration offered by the application. Do not change a key or value without understanding its purpose; prefer a dedicated menu when available and keep secrets out of screenshots, exports and public repositories.":
    "Configuración avanzada contiene ajustes técnicos ofrecidos por la aplicación. No cambie claves o valores sin entender su propósito; prefiera un menú dedicado y no incluya secretos en capturas, exportaciones o repositorios públicos.",
  "Alert thresholds configures external alert activation, thresholds and channel. Integrations groups monitoring connections, including Zabbix and Wazuh according to available options. Check destination, credentials and connectivity before activation.":
    "Umbrales de alerta configura activación externa, umbrales y canal. Integraciones reúne conexiones de supervisión, incluidos Zabbix y Wazuh según las opciones disponibles. Compruebe destino, credenciales y conectividad antes de activar.",
  "An authorized Docker collector can join the observability network identified in the interface. Check the ISMS test, then a timestamped metric in Zabbix/Prometheus or an identified event in Wazuh. Finally test a detection rule and notification in staging.":
    "Un recopilador Docker autorizado puede unirse a la red de observabilidad indicada en la interfaz. Compruebe la prueba ISMS y después una métrica fechada en Zabbix/Prometheus o un evento identificado en Wazuh. Pruebe finalmente una regla de detección y notificación en preproducción.",
  "An operator applies the file to the target collector, adapts hostnames, certificates and paths, then reloads that service using its procedure. API /metrics stays on the private network; do not expose it to the Internet to simplify testing.":
    "Un operador aplica el archivo al recopilador, adapta hosts, certificados y rutas y recarga el servicio según su procedimiento. /metrics de la API permanece en la red privada; no lo exponga a Internet para facilitar pruebas.",
  "An operator runs the read-only commands below from the server using the actual deployment Compose files. Check container states, recent errors, free space and inodes. Do not publish logs without masking sensitive data.":
    "Un operador ejecuta en el servidor los comandos de solo lectura siguientes con los archivos Compose del despliegue real. Compruebe contenedores, errores recientes, espacio libre e inodos. No publique registros sin ocultar datos sensibles.",
  "Archive content that should no longer be distributed. Deletion is a different operation: read the confirmation and verify the selected document. Use the trash for recoverable items and check their permissions after restoration.":
    "Archive el contenido que ya no deba distribuirse. Eliminar es otra operación: lea la confirmación y verifique el documento seleccionado. Use la papelera para elementos recuperables y compruebe sus permisos tras restaurarlos.",
  "Batch import processes multiple files. Check classification, language and metadata prepared for the batch, then review successes and failures. Start with a small representative batch before a large import.":
    "La importación por lotes procesa varios archivos. Compruebe clasificación, idioma y metadatos del lote; examine después éxitos y fallos. Empiece con un lote pequeño representativo antes de una importación grande.",
  "Before approving a sensitive operation, check the version and effects on publication, permissions or deletion. Record a reasoned decision using the authorized account; do not bypass self-approval restrictions where applicable.":
    "Antes de aprobar una operación sensible, compruebe versión y efectos sobre publicación, permisos o eliminación. Registre una decisión razonada con la cuenta autorizada; no eluda restricciones de autoaprobación cuando sean aplicables.",
  "Before permanent deletion, check retention and legal hold, backup and authorization, then confirm only the intended document. Afterwards check removal of relevant files and retention of the expected audit record.":
    "Antes de eliminar definitivamente, compruebe conservación, retención legal, copia de seguridad y autorización; confirme solo el documento previsto. Compruebe después la retirada de archivos asociados y la conservación del registro de auditoría esperado.",
  "Before using Advanced settings, identify an actually supported application key and its schema with an operator. Prefer the dedicated menu: Alert channels, Alert policy, Integrations, Storage or Directory.":
    "Antes de usar Configuración avanzada, identifique con un operador una clave realmente admitida por la aplicación y su esquema. Prefiera el menú dedicado: Canales de alerta, Política de alertas, Integraciones, Almacenamiento o Directorio.",
  "Check the actual destination and follow a test event in Observability. If no message arrives, check activation, channel, configuration, job and provider delivery in that order. Test thresholds in staging without generating errors or load in production.":
    "Compruebe el destino real y siga un evento de prueba en Observabilidad. Si no llega, compruebe en orden activación, canal, configuración, tarea y entrega del proveedor. Pruebe umbrales en preproducción sin generar errores ni carga en producción.",
  "Configure a directory connection with its server, search scope and dedicated service account. Use the available tests before synchronization. The account should only have the permissions required to read the directory.":
    "Configure la conexión del directorio con servidor, ámbito de búsqueda y cuenta de servicio dedicada. Use las pruebas antes de sincronizar. La cuenta solo debe tener los permisos necesarios para leer el directorio.",
  "Create the application in Entra and configure its credentials on the server. This menu displays SSO status and provides diagnostics; it does not save credentials. The current SSO proxy uses a client secret and does not support client certificate authentication.":
    "Cree la aplicación en Entra y configure sus credenciales en el servidor. Este menú muestra estado y diagnósticos SSO, pero no guarda credenciales. El proxy SSO actual utiliza un secreto cliente y no admite autenticación con certificado cliente.",
  "Distinguish operational alerts, publication notifications and review reminders. This screen's policy concerns operations; it does not replace reader ACLs, the upload notification choice or review participants.":
    "Distinga alertas operativas, notificaciones de publicación y recordatorios de revisión. La política de esta pantalla afecta a operaciones; no sustituye las ACL de lectores, la opción de notificación de carga ni los participantes de revisión.",
  "Do not import a PFX containing a private key or a secret. The LDAPS CA certificate, HTTPS certificate and SSO credentials serve three distinct purposes. Never disable TLS validation to bypass a chain or name error.":
    "No importe un PFX con clave privada ni secretos. La CA LDAPS, el certificado HTTPS y las credenciales SSO tienen tres finalidades distintas. Nunca desactive la validación TLS para eludir errores de cadena o nombre.",
  "Do not make the bucket public. Selecting a new target does not move existing files. Do not delete a mount, bucket or volume still referenced; also retain keys needed to restore encrypted settings, outside the repository.":
    "No haga público el bucket. Seleccionar otro destino no mueve los archivos existentes. No elimine un montaje, bucket o volumen aún referenciado; conserve también fuera del repositorio las claves para restaurar ajustes cifrados.",
  "Do not send email notifications for this upload or publication suppresses publication announcements for the relevant document. Check this choice before importing; do not confuse it with security alerts or review notifications.":
    "No enviar notificaciones por correo para esta carga o publicación suprime los anuncios del documento correspondiente. Compruebe esta opción antes de importar; no la confunda con alertas de seguridad o notificaciones de revisión.",
  "Document notifications, reviews and operational alerts correspond to different events. Configure each channel in its own screen: SMTP server or Microsoft Graph integration according to available configuration, then Teams, Slack or webhook as needed.":
    "Notificaciones documentales, revisiones y alertas operativas corresponden a eventos diferentes. Configure cada canal en su pantalla: SMTP o Microsoft Graph según la configuración disponible, y después Teams, Slack o webhook si procede.",
  "Download the generated configuration from the tool's entry. Also use the available Prometheus alert rules, Wazuh agent configuration and sample events, or Syslog Docker TLS example. Operational examples live in deploy/monitoring.":
    "Descargue la configuración generada desde la entrada de la herramienta. Use también las reglas Prometheus, configuración del agente y eventos de ejemplo Wazuh, o ejemplo Docker TLS Syslog disponibles. Los ejemplos operativos están en deploy/monitoring.",
  "Enter endpoint, region, bucket and prefix; select Path-style if your S3 service requires it. Enter the access key and secret in the protected fields. A native Azure Blob endpoint is not automatically an S3-compatible endpoint.":
    "Introduzca endpoint, región, bucket y prefijo; seleccione Path-style si su servicio S3 lo requiere. Introduzca clave de acceso y secreto en los campos protegidos. Un endpoint Azure Blob nativo no es automáticamente compatible con S3.",
  "Enter the validated key and its complete value, then save. Check target behavior and whether that setting requires reload or redeployment. Successfully saving JSON does not prove the application uses that key.":
    "Introduzca la clave validada y su valor completo; guarde. Compruebe el comportamiento y si requiere recarga o nuevo despliegue. Guardar JSON correctamente no demuestra que la aplicación utilice esa clave.",
  "Evidence may contain sensitive data. Check it can be viewed after upload; a saved decision comment does not guarantee successful attachment upload. Scheduling a review is not a decision, and retention is not a backup.":
    "Las pruebas pueden contener datos sensibles. Compruebe que se puedan consultar tras cargarlas; un comentario guardado no garantiza la carga correcta del adjunto. Programar una revisión no es decidir, y conservar no es hacer una copia de seguridad.",
  "Examples are values to adapt, not API commands to execute. Do not publish secrets in descriptions or supporting evidence. SMTP or Graph acceptance does not prove message receipt: check delivery errors and the recipient mailbox.":
    "Los ejemplos son valores que adaptar, no comandos API que ejecutar. No publique secretos en descripciones ni pruebas adjuntas. La aceptación SMTP o Graph no demuestra recepción: compruebe errores de entrega y buzón destinatario.",
  "Filter Overdue, In progress or Completed. An authorized administrator or moderator approves or rejects with a decision comment. Optional JPEG/PNG evidence is limited to 2 MiB. Check author, date, comment, document state after rejection and next due date after approval.":
    "Filtre Atrasadas, En curso o Completadas. Un administrador o moderador autorizado aprueba o rechaza con un comentario. Las pruebas JPEG/PNG opcionales se limitan a 2 MiB. Compruebe autor, fecha, comentario, estado tras rechazo y próxima fecha tras aprobación.",
  "For Microsoft Graph, use a dedicated sending application separate from SSO, with application Mail.Send permission and administrator consent. Configure Exchange restrictions for the sender mailbox. Upload the public certificate to Entra; its matching private key stays in protected ISMS configuration.":
    "Para Microsoft Graph, use una aplicación de envío dedicada, distinta del SSO, con permiso Mail.Send de aplicación y consentimiento administrativo. Restrinja el buzón remitente en Exchange. Cargue el certificado público en Entra; su clave privada permanece en la configuración protegida ISMS.",
  "For PostgreSQL, check connectivity and disk; for Redis, connectivity and the job queue; for ClamAV, availability and signatures; for storage, mounts and permissions. After recovery, check readiness and then a test viewing or upload operation.":
    "Para PostgreSQL, compruebe conexión y disco; para Redis, conexión y cola de tareas; para ClamAV, disponibilidad y firmas; para almacenamiento, montajes y permisos. Tras recuperar, compruebe disponibilidad y después una consulta o carga de prueba.",
  "For SKIPPED, check the upload notification choice, enabled event, recipient ACLs and mail attributes. For FAILED, resolve the cause and retry only the relevant delivery. For ACCEPTED, check provider trace, quarantine and recipient mailbox.":
    "Para SKIPPED, compruebe opción de notificación, evento activado, ACL destinatarias y atributos de correo. Para FAILED, resuelva la causa y reintente solo el envío afectado. Para ACCEPTED, compruebe trazas del proveedor, cuarentena y buzón destinatario.",
  "For SMB, an operator first mounts the share using SMB 3.x on the host and makes it available inside the container under /data/smb. In the interface, enter the mount name, for example documents; this field is neither a UNC URL nor a password.":
    "Para SMB, un operador monta primero el recurso con SMB 3.x en el host y lo expone en el contenedor bajo /data/smb. En la interfaz, introduzca el nombre del montaje, por ejemplo documents; no es una URL UNC ni una contraseña.",
  "For Teams, Slack or a generic webhook, enter an HTTPS URL obtained from the receiving service. The generic webhook can use a Bearer token. Save and test one channel at a time, then verify the message in the target tool.":
    "Para Teams, Slack o webhook genérico, introduzca una URL HTTPS obtenida del servicio receptor. El webhook genérico admite un token Bearer. Guarde y pruebe un canal cada vez; compruebe después el mensaje en la herramienta de destino.",
  "For a PEM file on a Linux host with OpenSSL installed, the commands below check metadata, then the chain and DNS name. The second test should return a zero TLS verification code; it does not test LDAP bind.":
    "Para un PEM en Linux con OpenSSL, los comandos siguientes comprueban metadatos y después cadena y nombre DNS. La segunda prueba debe devolver código cero de verificación TLS; no comprueba la autenticación LDAP.",
  "For a category or language change, search the document and metadata action. For a sign-in incident, correlate access denials with SSO/AD diagnostics and technical logs without distributing session tokens.":
    "Para cambiar categoría o idioma, busque el documento y la acción de metadatos. Para un problema de conexión, correlacione denegaciones con diagnósticos SSO/AD y registros técnicos sin distribuir tokens de sesión.",
  "For a local account, run Configure MFA, add the TOTP key to an authenticator and confirm a six-digit code. Check a new sign-in before closing your session. For Entra, MFA is controlled by tenant policies.":
    "Para una cuenta local, pulse Configurar MFA, añada la clave TOTP a un autenticador y confirme un código de seis dígitos. Compruebe otra conexión antes de cerrar la sesión. En Entra, las políticas del tenant controlan MFA.",
  "For a report, distinguish internal comments from the requester response. After processing, check request status, the actual applied result, audit record and notification. A sent response alone is not an ACL change.":
    "Para un reporte, distinga comentarios internos de respuesta al solicitante. Tras tratarlo, compruebe estado, resultado realmente aplicado, auditoría y notificación. Una respuesta enviada no modifica por sí sola las ACL.",
  "For a silent initial import, select Do not send email notifications for this upload or publication. Leave it unchecked when a document notification is wanted; recipients also depend on their permissions and delivery configuration.":
    "Para una importación inicial silenciosa, marque No enviar notificaciones por correo para esta carga o publicación. Déjela desmarcada si desea notificar; los destinatarios también dependen de sus permisos y configuración de envío.",
  "For missing email, interpret its status: WAITING awaits the worker, ACTIVE is processing, DELAYED is deferred, FAILED has failed, SKIPPED was not sent and ACCEPTED was accepted by the provider. Also check attempts and error details.":
    "Si falta un correo, interprete su estado: WAITING espera al worker, ACTIVE se procesa, DELAYED está aplazado, FAILED ha fallado, SKIPPED no se envió y ACCEPTED fue aceptado por el proveedor. Compruebe también intentos y detalles del error.",
  "From the Windows certificate console, export the public root and issuing CA certificates needed for the LDAPS chain, without private keys. The domain controller certificate must contain its FQDN and Server Authentication usage.":
    "Desde la consola de certificados Windows, exporte sin claves privadas los certificados públicos de CA raíz y emisora necesarios para LDAPS. El certificado del controlador debe incluir su FQDN y uso Server Authentication.",
  "ISMS Portal centralizes documents and their governance. Users view authorized content; moderators manage documents according to their effective permissions; administrators configure the portal, access and operations.":
    "ISMS Portal centraliza documentos y gobernanza. Los usuarios consultan contenido autorizado; los moderadores gestionan documentos según sus permisos efectivos; los administradores configuran el portal, accesos y operaciones.",
  "In Administrator accounts, choose a local account, an AD user found in the directory or an AD group selected from results. For AD, verify identity and actual mail before granting access; do not just enter a similar-looking account name.":
    "En Cuentas de administradores, elija una cuenta local, usuario AD encontrado en el directorio o grupo AD seleccionado. Para AD, verifique identidad y correo real antes de conceder acceso; no introduzca simplemente un nombre parecido.",
  "In Alert channels, configure SMTP separately from SSO. For a STARTTLS relay, enter host, port 587, username, password, sender and comma-separated recipients. For port 465, use direct TLS as required by the relay; do not confuse direct TLS with STARTTLS.":
    "En Canales de alerta, configure SMTP por separado del SSO. Para STARTTLS, introduzca host, puerto 587, identificador, contraseña, remitente y destinatarios separados por comas. Para 465, use TLS directo según el servidor; no confunda TLS directo con STARTTLS.",
  "In Authentication, add a Web platform and the portal's exact HTTPS URI followed by /oauth2/callback. Use this same URI for the portal, /admin and /moderator; do not create /admin/oauth2/callback. The current flow uses authorization code with PKCE, not implicit flow.":
    "En Autenticación, añada la plataforma Web y la URI HTTPS exacta del portal seguida de /oauth2/callback. Use la misma URI para portal, /admin y /moderator; no cree /admin/oauth2/callback. El flujo actual usa código de autorización con PKCE, no flujo implícito.",
  "In CA certificates, give the CA a clear name and import its public file. Supported extensions are PEM, CRT, CER, P7B and P7C; the portal accepts at most two certificates. Verify issuer, expiry and fingerprint against your trusted source.":
    "En Certificados de CA, asigne un nombre claro e importe el archivo público. Se admiten PEM, CRT, CER, P7B y P7C, con un máximo de dos certificados. Verifique emisor, caducidad y huella con su fuente de confianza.",
  "In Certificates & secrets, create a client secret and capture its value once, not its ID. An operator sets the variables below in the server's private .env, configures the proxy cookie/Redis secrets and deploys the configuration including docker-compose.sso.yml. Do not paste these secrets into Git or help content.":
    "En Certificados y secretos, cree un secreto cliente y capture su valor una vez, no su ID. Un operador configura las variables siguientes en el .env privado del servidor, los secretos cookie/Redis del proxy y despliega con docker-compose.sso.yml. No pegue secretos en Git ni en la ayuda.",
  "In Enterprise applications, require assignment and assign a pilot user first. In ISMS > SSO sign-in, run Entra and proxy diagnostics. Then test /oauth2/start?rd=/, /oauth2/start?rd=/admin and /oauth2/start?rd=/moderator using an identity authorized for each role.":
    "En Aplicaciones empresariales, exija asignación y asigne primero un usuario piloto. En ISMS > Inicio de sesión SSO, ejecute diagnósticos Entra y proxy. Pruebe /oauth2/start?rd=/, /oauth2/start?rd=/admin y /oauth2/start?rd=/moderator con una identidad autorizada para cada rol.",
  "In Integrations, identify the signal to collect: metrics for Prometheus/Zabbix, logs for Syslog/Wazuh. Choose one responsible collector per signal and prepare private network access before enabling monitoring.":
    "En Integraciones, identifique la señal: métricas para Prometheus/Zabbix, registros para Syslog/Wazuh. Elija un recopilador responsable por señal y prepare el acceso de red privada antes de activar supervisión.",
  "In LDAP synchronization, configure the group base to include this OU, enable the connector and run synchronization. If the group is missing, check the filter, search base and bind account read permissions.":
    "En Sincronización LDAP, configure la base de grupos para incluir esta OU, active el conector y sincronice. Si falta el grupo, compruebe filtro, base de búsqueda y permisos de lectura de la cuenta de conexión.",
  "In LDAP synchronization, create the connector using the example fields below. The OU bases must actually exist in your directory. Enter the bind password in the protected field, never in an example or screenshot.":
    "En Sincronización LDAP, cree el conector con los campos de ejemplo. Las bases OU deben existir realmente en su directorio. Introduzca la contraseña de conexión en el campo protegido, nunca en ejemplos o capturas.",
  "In Storage, click Add storage and select S3 compatible or SMB/CIFS. For S3, prepare an existing private bucket, its HTTPS endpoint and credentials limited to the read, write and delete operations required for this target.":
    "En Almacenamiento, pulse Añadir almacenamiento y elija Compatible S3 o SMB/CIFS. Para S3, prepare un bucket privado existente, su endpoint HTTPS y credenciales limitadas a las operaciones de lectura, escritura y eliminación necesarias.",
  "Incidents and CAPA: record reference, severity, owner, date, root cause and lessons, then track corrective actions. Exceptions: enter owner, justification, approver and expiry; check the decision and validity before treating an exception as accepted.":
    "Incidentes y CAPA: registre referencia, gravedad, propietario, fecha, causa raíz y lecciones; siga las acciones correctivas. Excepciones: introduzca propietario, justificación, aprobador y caducidad; compruebe decisión y validez antes de considerar aceptada una excepción.",
  "Lifetime access: examine permanent rules and their justification. Controls and SoA: enter framework, reference, applicability, implementation status, owner, justification and evidence document; a document link alone does not prove control implementation.":
    "Acceso permanente: examine reglas y justificación. Controles y SoA: introduzca marco, referencia, aplicabilidad, implementación, propietario, justificación y documento de prueba; un enlace documental no demuestra por sí solo la implementación.",
  "Mark integration as enabled records a state: it does not install an agent or a Zabbix/Wazuh server. A successful local test does not prove remote ingestion. Do not open ports or Docker networks to unauthorized collectors.":
    "Marcar integración como activada registra un estado: no instala un agente ni un servidor Zabbix/Wazuh. Una prueba local correcta no demuestra recepción remota. No abra puertos ni redes Docker a recopiladores no autorizados.",
  "On regression, restore the previous value through the same authorized mechanism and verify the result. Docker/.env variables remain configured server-side: a key on this screen does not automatically replace them.":
    "Ante una regresión, restaure el valor anterior mediante el mismo mecanismo autorizado y verifique el resultado. Las variables Docker/.env siguen configurándose en el servidor: una clave de esta pantalla no las sustituye automáticamente.",
  "Permanent deletion cannot be reversed from trash. Deletion should remove the document from active review tracking without erasing required audit records; also check that no active reminder still targets it.":
    "La eliminación definitiva no puede revertirse desde la papelera. Eliminar debe retirar el documento del seguimiento activo de revisiones sin borrar la auditoría necesaria; compruebe también que ningún recordatorio activo siga apuntándolo.",
  "Prepare a dedicated service account with only the required read access to users and groups. From the ISMS server network, verify DNS resolution and TCP/636 access to the controller, then import its CA in CA certificates.":
    "Prepare una cuenta de servicio dedicada con solo lectura de usuarios y grupos necesaria. Desde la red del servidor ISMS, compruebe resolución DNS y acceso TCP/636 al controlador; importe después su CA en Certificados de CA.",
  "Publish after validation, then test viewing and any download using a member and a non-member with no other authorization. For root causes and corrective actions, also use Incidents and CAPA in ISMS governance.":
    "Publique tras validar; pruebe consulta y descarga con un miembro y un no miembro sin otras autorizaciones. Para causas raíz y acciones correctivas, use también Incidentes y CAPA de Gobernanza ISMS.",
  "Retain the previous value in a protected location. JSON value requires strict JSON: double quotes, true/false booleans, no comments or trailing commas. The example below shows syntax only, not configuration to apply to any key.":
    "Conserve el valor anterior en un lugar protegido. Valor JSON exige JSON estricto: comillas dobles, booleanos true/false, sin comentarios ni comas finales. El ejemplo solo muestra sintaxis, no una configuración aplicable a cualquier clave.",
  "Retention: select document, retention date and reason. Legal hold protects regulatory or litigation retention; check this constraint before deletion. Identity health: examine reported identities and groups before removing legitimate access.":
    "Conservación: seleccione documento, fecha y motivo. La retención legal protege obligaciones regulatorias o litigios; compruébela antes de eliminar. Salud de identidades: examine identidades y grupos señalados antes de retirar accesos legítimos.",
  "Review the decision evidence, any supporting attachments and the next due date before closing follow-up. Other views cover controls and SoA, retention, exceptions, identity health, incidents, CAPA and indicators.":
    "Examine la prueba de decisión, adjuntos justificativos y próxima fecha límite antes de cerrar el seguimiento. Otras vistas cubren controles y SoA, conservación, excepciones, identidades, incidentes, CAPA e indicadores.",
  "Reviews: after publishing, check that the document appears in the queue. For a manual review, select document, owner, reviewer, approver and due date. AD selections must match real identities; selecting a participant does not grant a management role.":
    "Revisiones: tras publicar, compruebe el documento en la cola. Para revisión manual, seleccione documento, propietario, revisor, aprobador y fecha límite. Las selecciones AD deben corresponder a identidades reales; seleccionar un participante no concede un rol de gestión.",
  "Save, test the connector and run synchronization. Check the last successful sync date and the expected group's presence. Finally sign in through AD using the test account and verify its documents and rules.":
    "Guarde, pruebe el conector y sincronice. Compruebe fecha del último éxito y presencia del grupo esperado. Conecte finalmente la cuenta de prueba mediante AD y verifique sus documentos y reglas.",
  "Search covers name, DN and description; the filter distinguishes active and inactive groups. Deleting a group can remove associated rules: read the confirmation and check affected spaces before proceeding.":
    "La búsqueda abarca nombre, DN y descripción; el filtro distingue grupos activos e inactivos. Eliminar un grupo puede retirar sus reglas: lea la confirmación y compruebe los espacios afectados antes de continuar.",
  "Service health shows dependency availability. Observability gathers operational signals, work queues and email deliveries. Audit log provides operation searches and their records. These screens have different purposes.":
    "Salud de servicios muestra disponibilidad de dependencias. Observabilidad reúne señales operativas, colas y envíos de correo. Registro de auditoría permite buscar operaciones y sus registros. Estas pantallas tienen finalidades distintas.",
  "Set Manage, Publish and Archive/delete according to need. Manage is the prerequisite: the example below allows document management without publication or deletion. Also check spaces accessible to the identity.":
    "Defina Gestionar, Publicar y Archivar/eliminar según la necesidad. Gestionar es requisito previo: el ejemplo permite gestión sin publicar ni eliminar. Compruebe también los espacios accesibles a la identidad.",
  "TLS failure: check CA, chain, expiry and FQDN. Bind failure: check DN, password and account status. Zero results: check bases, filters and read permissions. A successful TLS test does not prove synchronization or ACLs work.":
    "Fallo TLS: compruebe CA, cadena, caducidad y FQDN. Fallo de conexión: DN, contraseña y estado de la cuenta. Sin resultados: bases, filtros y lectura. TLS correcto no demuestra que sincronización o ACL funcionen.",
  "Test sign-in at /admin with that account using SSO or AD as configured. Check the grant record, validity and active sessions. For a departure or incident, remove the grant, revoke relevant sessions and retest access.":
    "Pruebe /admin con esa cuenta mediante SSO o AD según la configuración. Compruebe concesión, validez y sesiones. Ante baja o incidente, retire la concesión, revoque sesiones afectadas y vuelva a probar acceso.",
  "The API manages graphTenantId, graphClientId, graphSender, graphCertificatePem and graphPrivateKeyPem. If the form does not expose these fields, have an operator use the administrative channels API; do not store a private key in Advanced settings. Preserve other channel settings when updating.":
    "La API gestiona graphTenantId, graphClientId, graphSender, graphCertificatePem y graphPrivateKeyPem. Si el formulario no los expone, un operador debe usar la API administrativa de canales; no guarde claves privadas en Configuración avanzada. Conserve los demás ajustes al actualizar.",
  "The Moderators menu defines document managers and their scope. Their dedicated workspace is available at /moderator. Test permissions with a real moderator account: an administrator session does not validate moderator restrictions.":
    "El menú Cuentas de moderadores define responsables documentales y su ámbito. Su espacio dedicado está en /moderator. Pruebe con una cuenta real de moderador: una sesión administrativa no valida sus restricciones.",
  "The Storage menu configures available document storage targets. Test availability before use. A complete backup includes PostgreSQL and files; test restoration in an isolated environment and do not delete production volumes during an update.":
    "Almacenamiento configura los destinos documentales disponibles. Pruebe su disponibilidad antes de usarlos. Una copia completa incluye PostgreSQL y archivos; pruebe restauración aislada y no elimine volúmenes de producción al actualizar.",
  "The administrator role grants access to sensitive configuration. Entra application assignment does not replace an ISMS grant. The primary account is protected from deletion; keep a fallback account without granting an entire business group.":
    "El rol de administrador permite configuración sensible. La asignación de la aplicación Entra no sustituye una concesión ISMS. La cuenta principal está protegida; conserve una cuenta alternativa sin conceder acceso a todo un grupo empresarial.",
  "The current SSO proxy does not support a client certificate: uploading one in Entra does not replace the secret. Microsoft Graph or LDAPS CA certificates do not configure this SSO. For sign-in loops, check URI, assignment, secret expiry, HTTPS cookies and ISMS privileges before disabling any protection.":
    "El proxy SSO actual no admite certificado cliente: cargarlo en Entra no sustituye al secreto. Los certificados Microsoft Graph o CA LDAPS no configuran este SSO. Ante bucles, compruebe URI, asignación, caducidad del secreto, cookies HTTPS y privilegios ISMS antes de desactivar protecciones.",
  "The review queue distinguishes overdue, in-progress and completed items. Check participants, due date and the relevant document. Authorized moderators and administrators record a decision with a justification retained in the review record.":
    "La cola distingue revisiones atrasadas, en curso y completadas. Compruebe participantes, fecha límite y documento. Los moderadores y administradores autorizados registran su decisión con una justificación conservada en la revisión.",
  "The web frontend communicates with an API that enforces business rules. PostgreSQL stores data and audit records; Redis transports asynchronous tasks; a worker processes jobs; ClamAV scans files. The proxy exposes the portal over HTTPS.":
    "El frontend web se comunica con una API que aplica las reglas de negocio. PostgreSQL guarda datos y auditoría; Redis transporta tareas asíncronas; un worker las procesa; ClamAV analiza archivos. El proxy expone el portal mediante HTTPS.",
  "This SSO requests openid profile email scopes. Do not add Mail.Send or Directory.Read.All just to sign a user in. Follow the tenant's consent policy. Microsoft Graph email delivery is a separate integration.":
    "Este SSO solicita openid profile email. No añada Mail.Send ni Directory.Read.All solo para conectar usuarios. Respete el consentimiento del tenant. El envío de correo Microsoft Graph es una integración independiente.",
  "To diagnose a problem, record the time, action and document, then review audit records, jobs and health. A green indicator does not guarantee a complete user journey works: also verify the relevant operation.":
    "Para diagnosticar, anote hora, acción y documento y consulte auditoría, tareas y salud. Un indicador verde no garantiza un recorrido completo: verifique también la operación afectada.",
  "Verify the session, resolved AD groups and accessible documents before expanding assignments. Administrator and moderator privileges are configured separately in ISMS: Entra assignment does not grant them. Keep AD sign-in and a fallback account operational.":
    "Verifique sesión, grupos AD resueltos y documentos accesibles antes de ampliar asignaciones. Los privilegios de administrador y moderador se configuran por separado en ISMS: Entra no los concede. Mantenga operativas la conexión AD y una cuenta alternativa.",
  "Views and bulk: prepare a selection and check each document before a bulk operation. KPI/KRI dashboard: compare counters with review, control, incident and approval lists. Before reminding, check participants, mail attributes and email history in Observability.":
    "Vistas y lotes: prepare la selección y compruebe cada documento antes de actuar en lote. KPI/KRI: compare contadores con listas de revisiones, controles, incidentes y aprobaciones. Antes de recordar, compruebe participantes, atributos mail e historial en Observabilidad.",
  "When editing, the name and new credentials can be changed; type, bucket and location are fixed. To change location, prepare a new target and a controlled migration. Back up PostgreSQL and files together, then test an isolated restoration.":
    "Al editar, puede cambiar nombre y nuevas credenciales; tipo, bucket y ubicación son fijos. Para cambiar ubicación, prepare otro destino y una migración controlada. Respalde PostgreSQL y archivos juntos y pruebe una restauración aislada.",
};
