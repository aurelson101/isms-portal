import { X509Certificate } from "crypto";
import forge from "node-forge";

const MAX_CERTIFICATE_BYTES = 48 * 1024;

const decodeText = (content: Buffer) => {
  if (content[0] === 0xff && content[1] === 0xfe)
    return new TextDecoder("utf-16le").decode(content).trim();
  return new TextDecoder()
    .decode(content)
    .replace(/^\uFEFF/, "")
    .trim();
};

const parsePkcs7 = (content: Buffer | string) => {
  try {
    const message =
      typeof content === "string"
        ? forge.pkcs7.messageFromPem(content)
        : forge.pkcs7.messageFromAsn1(
            forge.asn1.fromDer(content.toString("binary")),
          );
    if (!("certificates" in message)) return [];
    return (message.certificates || []).map(
      (certificate: forge.pki.Certificate) =>
        new X509Certificate(forge.pki.certificateToPem(certificate)),
    );
  } catch {
    return [];
  }
};

export const parseCaCertificates = ({
  contentBase64,
  pem,
}: {
  contentBase64?: string;
  pem?: string;
}) => {
  const content = contentBase64
    ? Buffer.from(contentBase64, "base64")
    : Buffer.from(pem || "", "utf8");
  if (!content.length)
    throw new Error("Select a public certificate file to import");
  if (content.length > MAX_CERTIFICATE_BYTES)
    throw new Error("The certificate file exceeds the 48 KiB limit");

  const text = decodeText(content);
  if (/PRIVATE KEY/i.test(text)) throw new Error("Private keys are forbidden");

  let certificates: X509Certificate[];
  const certificateBlocks = text.match(
    /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g,
  );
  if (certificateBlocks?.length) {
    try {
      certificates = certificateBlocks.map(
        (block) => new X509Certificate(block),
      );
    } catch {
      certificates = [];
    }
  } else if (/-----BEGIN (PKCS7|CMS)-----/.test(text)) {
    certificates = parsePkcs7(text);
  } else {
    try {
      certificates = [new X509Certificate(content)];
    } catch {
      certificates = parsePkcs7(content);
    }
  }

  if (!certificates.length)
    throw new Error(
      "Unsupported certificate content: export the ADCS CA certificate or chain as X.509 PEM/DER or PKCS#7",
    );
  const caCertificates = certificates.filter((certificate) => certificate.ca);
  if (!caCertificates.length)
    throw new Error("The file contains no CA certificate");
  return caCertificates;
};
