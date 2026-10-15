// Lo único de una persona que viaja cuando una respuesta la muestra junto a
// otra entidad (el estudiante de una postulación, el tutor de un placement).
// Un `include` con `true` devolvería la fila entera, hash de contraseña
// incluido. Una sola definición para que ningún endpoint se quede atrás.
// Revisión completa: openspec/changes/audit-autorizacion-e3-01/findings/revision-campos-usuario.md
export const PUBLIC_USER = { select: { id: true, fullName: true, email: true } } as const
