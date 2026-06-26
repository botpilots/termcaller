package se.botpilots.services.termbase;

import com.thaiopensource.util.PropertyMapBuilder;
import com.thaiopensource.validate.ValidationDriver;
import com.thaiopensource.xml.sax.XMLReaderCreator;
import org.xml.sax.InputSource;
import org.xml.sax.EntityResolver;
import org.xml.sax.SAXException;
import org.xml.sax.XMLReader;

import javax.xml.parsers.SAXParserFactory;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.io.StringReader;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.regex.Pattern;

public class TbxValidator {

    /**
     * TBX files often declare {@code <!DOCTYPE martif SYSTEM "coreStructure.dtd">}. Jing's
     * {@link ValidationDriver} parses the instance with an XMLReader that does not use our
     * {@link com.thaiopensource.validate.ValidateProperty#XML_READER_CREATOR}, so the JDK
     * resolver tries to open that path (usually relative to the process working directory).
     * RELAX NG validation does not need the DTD; strip it before validating.
     */
    private static final Pattern DOCTYPE_AFTER_OPTIONAL_XML_DECL =
            Pattern.compile("^\uFEFF?(\\s*<\\?xml[^?]*\\?>)?\\s*<!DOCTYPE\\b[\\s\\S]*?>\\s*");

    public static boolean validate(InputStream xmlStream, InputStream schemaStream) {
        try {
            byte[] raw = xmlStream.readAllBytes();
            String text = new String(raw, StandardCharsets.UTF_8);
            text = DOCTYPE_AFTER_OPTIONAL_XML_DECL.matcher(text).replaceFirst("$1");

            InputStream stripped = new ByteArrayInputStream(text.getBytes(StandardCharsets.UTF_8));

            PropertyMapBuilder properties = new PropertyMapBuilder();
            
            // Provide a dummy entity resolver to prevent the parser from trying to fetch the DTD from the filesystem/network
            EntityResolver dummyResolver = new EntityResolver() {
                @Override
                public InputSource resolveEntity(String publicId, String systemId) throws SAXException, IOException {
                    return new InputSource(new StringReader("")); // Always return empty for any external entity
                }
            };
            
            // Create a custom XMLReaderCreator that sets the EntityResolver
            XMLReaderCreator xmlReaderCreator = new XMLReaderCreator() {
                @Override
                public XMLReader createXMLReader() throws SAXException {
                    try {
                        SAXParserFactory factory = SAXParserFactory.newInstance();
                        factory.setNamespaceAware(true);
                        XMLReader reader = factory.newSAXParser().getXMLReader();
                        reader.setEntityResolver(dummyResolver);
                        return reader;
                    } catch (Exception e) {
                        throw new SAXException(e);
                    }
                }
            };
            
            properties.put(com.thaiopensource.validate.ValidateProperty.XML_READER_CREATOR, xmlReaderCreator);
            
            ValidationDriver driver = new ValidationDriver(properties.toPropertyMap());
            
            InputSource schemaSource = new InputSource(schemaStream);
            if (!driver.loadSchema(schemaSource)) {
                throw new TbxValidationException("Failed to load TBX schema", null);
            }

            InputSource xmlSource = new InputSource(stripped);

            return driver.validate(xmlSource);
        } catch (TbxValidationException e) {
            throw e;
        } catch (Exception e) {
            throw new TbxValidationException("Validation failed", e);
        }
    }
}
