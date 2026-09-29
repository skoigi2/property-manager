import "server-only";
import { noHyphenation } from "@/lib/pdf-setup";
import React from "react";
import { renderToBuffer, Document, Page, Text, View, StyleSheet, DocumentProps } from "@react-pdf/renderer";
import type { JSXElementConstructor, ReactElement } from "react";
import type { RentIncreaseNotice } from "@/lib/rent-increase-notice";

// One-page rent increase letter. Wording comes from rent-increase-notice.ts
// (shared with the email).

const styles = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 10.5, color: "#1a1a2e", paddingTop: 50, paddingHorizontal: 60, paddingBottom: 60, lineHeight: 1.5 },
  letterhead: { borderBottomWidth: 2, borderBottomColor: "#c9a84c", paddingBottom: 10, marginBottom: 22 },
  sender: { fontSize: 14, fontFamily: "Helvetica-Bold", color: "#132635" },
  senderSub: { fontSize: 9, color: "#6b7280", marginTop: 2 },
  meta: { marginBottom: 18 },
  metaLine: { fontSize: 10 },
  title: { fontSize: 12, fontFamily: "Helvetica-Bold", color: "#132635", marginBottom: 14, textDecoration: "underline" },
  para: { marginBottom: 10 },
  terms: { marginBottom: 10, backgroundColor: "#f8f5ec", borderRadius: 3, padding: 10 },
  termsLine: { fontFamily: "Helvetica-Bold", fontSize: 10.5 },
  signOff: { marginTop: 18 },
  ack: { marginTop: 36, borderTopWidth: 1, borderTopColor: "#e5e7eb", paddingTop: 12 },
  ackTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#6b7280", marginBottom: 14 },
  ackLine: { fontSize: 9, color: "#6b7280", marginBottom: 14 },
});

export interface RentIncreaseNoticePdfInput {
  notice: RentIncreaseNotice;
  senderName: string;
  propertyName: string;
  today: string;
  tenantName: string;
  unitNumber: string;
}

function Doc({ input }: { input: RentIncreaseNoticePdfInput }) {
  const [salutation, intro, terms, ...rest] = input.notice.paragraphs;
  return (
    <Document title={input.notice.subject}>
      <Page size="A4" style={styles.page}>
        <View style={styles.letterhead}>
          <Text style={styles.sender}>{input.senderName}</Text>
          {input.senderName !== input.propertyName && <Text style={styles.senderSub}>{input.propertyName}</Text>}
        </View>

        <View style={styles.meta}>
          <Text style={styles.metaLine}>Date: {input.today}</Text>
          <Text style={[styles.metaLine, { marginTop: 8 }]}>To: {input.tenantName}</Text>
          <Text style={styles.metaLine}>Unit {input.unitNumber}, {input.propertyName}</Text>
        </View>

        <Text style={styles.title}>{input.notice.title}</Text>
        <Text style={styles.para}>{salutation}</Text>
        <Text style={styles.para} hyphenationCallback={noHyphenation}>{intro}</Text>
        <View style={styles.terms}>
          {terms.split("\n").map((line) => (
            <Text key={line} style={styles.termsLine}>{line}</Text>
          ))}
        </View>
        {rest.map((p) => (
          <Text key={p} style={styles.para} hyphenationCallback={noHyphenation}>{p}</Text>
        ))}

        <View style={styles.signOff}>
          {input.notice.signOff.map((l) => <Text key={l}>{l}</Text>)}
        </View>

        <View style={styles.ack} wrap={false}>
          <Text style={styles.ackTitle}>TENANT ACKNOWLEDGEMENT (OPTIONAL)</Text>
          <Text style={styles.ackLine}>I acknowledge receipt of this notice.</Text>
          <Text style={styles.ackLine}>Name: ______________________________   Signature: ____________________   Date: ______________</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function generateRentIncreaseNoticePdf(input: RentIncreaseNoticePdfInput): Promise<Buffer> {
  const element = React.createElement(Doc, { input }) as ReactElement<DocumentProps, string | JSXElementConstructor<unknown>>;
  return Buffer.from(await renderToBuffer(element));
}
