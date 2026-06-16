export interface Documento {
    id: number;
    tipoDocumento: number;
    fechaSubida: string;      // viene como ISO string desde .NET
    nombreOriginal: string;
    tamanoBytes: number;
}


export interface DocumentoUploadResult {
    totalRegistrosCreados: number;
    idsDocumentosCreados: number[];
}
