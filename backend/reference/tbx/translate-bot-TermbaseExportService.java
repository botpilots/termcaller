package se.botpilots.services.termbase;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import se.botpilots.models.termbase.AdministrativeStatus;
import se.botpilots.models.termbase.TermbaseEntry;
import se.botpilots.models.termbase.TermbaseTerm;

import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.transform.OutputKeys;
import javax.xml.transform.Transformer;
import javax.xml.transform.TransformerFactory;
import javax.xml.transform.dom.DOMSource;
import javax.xml.transform.stream.StreamResult;
import java.io.StringWriter;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@ApplicationScoped
public class TermbaseExportService {

    @Inject
    EntityManager em;

    public String exportToTbxBasic(UUID customerId, String defaultLanguage) {
        try {
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            DocumentBuilder builder = factory.newDocumentBuilder();
            Document doc = builder.newDocument();

            // Root elements
            Element martif = doc.createElement("martif");
            martif.setAttribute("type", "TBX-Basic");
            martif.setAttribute("xml:lang", defaultLanguage);
            doc.appendChild(martif);

            // Header
            Element martifHeader = doc.createElement("martifHeader");
            martif.appendChild(martifHeader);

            Element fileDesc = doc.createElement("fileDesc");
            martifHeader.appendChild(fileDesc);

            Element titleStmt = doc.createElement("titleStmt");
            fileDesc.appendChild(titleStmt);

            Element title = doc.createElement("title");
            title.setTextContent("Exported Termbase");
            titleStmt.appendChild(title);

            Element sourceDesc = doc.createElement("sourceDesc");
            fileDesc.appendChild(sourceDesc);

            Element p = doc.createElement("p");
            p.setTextContent("Exported from Managed Termbase");
            sourceDesc.appendChild(p);

            // Body
            Element text = doc.createElement("text");
            martif.appendChild(text);

            Element body = doc.createElement("body");
            text.appendChild(body);

            // Fetch all entries for customer
            List<TermbaseEntry> entries = TermbaseEntry.find("customerId", customerId).list();

            for (TermbaseEntry entry : entries) {
                Element termEntry = doc.createElement("termEntry");
                termEntry.setAttribute("id", "c" + entry.id);
                body.appendChild(termEntry);

                // Concept level subjectField
                if (entry.subjectField != null) {
                    Element subjectField = doc.createElement("descrip");
                    subjectField.setAttribute("type", "subjectField");
                    subjectField.setTextContent(entry.subjectField.name);
                    termEntry.appendChild(subjectField);
                }

                // Concept-level definition (TermbaseEntry): TBX-Basic allows <descrip type="definition"> on
                // termEntry or langSet — not on tig. Import stores concept-only text on the entry and does not
                // copy it onto terms; export must not "fan out" that same string under every langSet.
                if (entry.definition != null && !entry.definition.trim().isEmpty()) {
                    Element conceptDef = doc.createElement("descrip");
                    conceptDef.setAttribute("type", "definition");
                    conceptDef.setTextContent(entry.definition);
                    termEntry.appendChild(conceptDef);
                }

                // Group terms by language
                Map<String, List<TermbaseTerm>> termsByLang = entry.terms.stream()
                        .collect(Collectors.groupingBy(t -> t.language));

                for (Map.Entry<String, List<TermbaseTerm>> langGroup : termsByLang.entrySet()) {
                    Element langSet = doc.createElement("langSet");
                    langSet.setAttribute("xml:lang", langGroup.getKey());
                    termEntry.appendChild(langSet);

                    List<TermbaseTerm> terms = langGroup.getValue();

                    // Hoist tig-level definitions to langSet: pick best AdministrativeStatus within this language.
                    // Do not fall back to entry.definition here — that belongs on termEntry only (see above).
                    TermbaseTerm termWithBestDef = terms.stream()
                            .filter(t -> t.definition != null && !t.definition.trim().isEmpty())
                            .min((t1, t2) -> compareAdminStatus(t1.adminStatus, t2.adminStatus))
                            .orElse(null);

                    if (termWithBestDef != null) {
                        Element def = doc.createElement("descrip");
                        def.setAttribute("type", "definition");
                        def.setTextContent(termWithBestDef.definition);
                        langSet.appendChild(def);
                    }

                    // Add terms (tigs)
                    for (TermbaseTerm term : terms) {
                        Element tig = doc.createElement("tig");
                        langSet.appendChild(tig);

                        Element termEl = doc.createElement("term");
                        termEl.setTextContent(term.text);
                        tig.appendChild(termEl);

                        Element adminStatus = doc.createElement("termNote");
                        adminStatus.setAttribute("type", "administrativeStatus");
                        adminStatus.setTextContent(formatAdminStatus(term.adminStatus));
                        tig.appendChild(adminStatus);
                    }
                }
            }

            // Convert to String
            TransformerFactory transformerFactory = TransformerFactory.newInstance();
            Transformer transformer = transformerFactory.newTransformer();
            transformer.setOutputProperty(OutputKeys.INDENT, "yes");
            transformer.setOutputProperty("{http://xml.apache.org/xslt}indent-amount", "2");

            DOMSource source = new DOMSource(doc);
            StringWriter writer = new StringWriter();
            StreamResult result = new StreamResult(writer);
            transformer.transform(source, result);

            return writer.toString();

        } catch (Exception e) {
            throw new RuntimeException("Failed to export TBX", e);
        }
    }

    private int compareAdminStatus(AdministrativeStatus s1, AdministrativeStatus s2) {
        if (s1 == s2) return 0;
        if (s1 == AdministrativeStatus.PREFERRED) return -1;
        if (s2 == AdministrativeStatus.PREFERRED) return 1;
        if (s1 == AdministrativeStatus.ADMITTED) return -1;
        if (s2 == AdministrativeStatus.ADMITTED) return 1;
        if (s1 == AdministrativeStatus.NOT_RECOMMENDED) return -1;
        if (s2 == AdministrativeStatus.NOT_RECOMMENDED) return 1;
        return 0; // OBSOLETE
    }

    private String formatAdminStatus(AdministrativeStatus status) {
        if (status == null) return "preferredTerm-admn-sts";
        return switch (status) {
            case PREFERRED -> "preferredTerm-admn-sts";
            case ADMITTED -> "admittedTerm-admn-sts";
            case NOT_RECOMMENDED -> "deprecatedTerm-admn-sts";
            case OBSOLETE -> "obsoleteTerm-admn-sts";
        };
    }
}
