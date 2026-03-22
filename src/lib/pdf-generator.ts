import "server-only";

import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import React from "react";
import type { ReactElement, JSXElementConstructor } from "react";
import { ReportDocument } from "@/components/report/pdf/ReportDocument";
import type { ReportData } from "@/types/report";

export async function generateReportPDF(data: ReportData): Promise<Buffer> {
  const element = React.createElement(ReportDocument, { data }) as unknown as ReactElement<DocumentProps, JSXElementConstructor<DocumentProps>>;
  const buffer = await renderToBuffer(element);
  return Buffer.from(buffer);
}
