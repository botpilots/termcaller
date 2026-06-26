# 🌍 Reality-Grounded Terminology Generation (termcaller)

> **Elevator Pitch:** *Termcaller* revolutionizes technical translation by using vision AI to understand what words actually mean in physical reality. Instead of blindly extracting generic terms from text, we analyze diagrams and illustrations to generate precise, visually-grounded concepts—empowering technical authors and localization teams with better terminology, faster.

**Built in 48 hours for the Localization Hackathon.**

---

## 🚀 What We Achieved in 48 Hours

During this hackathon, we built a fully functional end-to-end web application capable of multimodal terminology extraction:

- **Multimodal AI Integration:** Integrated **Google Gemini 3 Flash** to analyze visual diagrams alongside local text to generate accurate concept definitions.
- **Semantic Vector Clustering:** Used `text-embedding-004` to semantically group and cluster concepts based on physical meaning, automatically merging identical concepts (≥95% similarity).
- **Domain Corpus Scoring:** Developed an algorithm to score and deprioritize generic words using a service manual corpus.
- **PDF Processing Pipeline:** Implemented extraction of illustrations and text context directly from technical manuals.
- **Interactive UI:** Built a complete React frontend allowing users to upload PDFs, curate terminology, visualize semantic outliers, and manage concepts.
- **TBX-Basic Export:** Fully compliant terminology export ready for CAT tools and Translation Memory systems.

---

## 🎥 Demo & Screenshots

*(Judges: Check out our application in action!)*

**▶️ [Watch the Demo Video Here](#) *(Placeholder)***

### Gallery
| Dashboard & Upload | Curation & Clustering | Visual Context Validation |
|:---:|:---:|:---:|
| ![Dashboard Screenshot](docs/assets/placeholder_dashboard.png) <br> *Upload and process technical manuals* | ![Curation Screenshot](docs/assets/placeholder_curation.png) <br> *Auto-merging & semantic clustering* | ![Validation Screenshot](docs/assets/placeholder_validation.png) <br> *Verifying terms against visual reality* |

---

## 💡 The Problem

Terminology is inherently difficult. Unlike complete paragraphs or procedures, individual terms contain very little semantic information. Consider terms like `cover`, `bracket`, `guide`, or `holder`. These words can represent entirely different concepts depending on the product and the surrounding visual context.

Traditional terminology extraction operates on text alone. AI tends to extract every seemingly important noun while having little understanding of whether those words represent distinct engineering concepts. This leads to generic source terms, underspecified translations, and workflows that optimize for consistency over conceptual accuracy.

---

## 🛠️ Our Approach

Rather than extracting terminology from language alone, we generate concept candidates from **visual evidence**. 

Images contain information missing from text. A diagram may reveal that an "attachment point" is actually a "top tether anchor." A component described as a "cover" may visually correspond to an inspection panel or battery compartment cover. The image becomes the primary source of semantic information, while the surrounding text provides local grounding.

### Workflow
1. **Extraction:** Extract all illustrations from the document. Every illustration becomes an independent processing task.
2. **Contextualization:** Identify callouts, labels, surrounding documentation, and figure captions to establish the local context for every referenced object.
3. **Generation:** **Gemini 3 Flash** receives the illustration, nearby documentation, and the callout identifier to generate a source term, candidate concept name, and a concise definition describing the object and its engineering function.
4. **Vector Clustering:** Concept definitions are embedded into a semantic vector space. Concept candidates are grouped by their source term, and semantic similarity is calculated between all generated definitions to produce a similarity distribution.
5. **Curation & Validation:** The UI highlights potential semantic outliers, allowing terminology managers to decide whether concepts should be merged, split, or modified.

---

## ⚙️ Technical Architecture

A monolithic repository built with modern web technologies:

- **Frontend:** React 19, React Router, Vite, Tailwind CSS, Lucide Icons.
- **Backend:** Node.js, Express, SQLite (Prisma ORM).
- **AI Integration:** Google Gemini 3 Flash (multimodal extraction, validation) & `text-embedding-004` (semantic vectors).
- **Document Processing:** `pdfjs-dist` (PDF text/image extraction) & `gm` (GraphicsMagick for images).

### Data Model
- **Users:** Authentication.
- **Projects:** Partitions terminology per uploaded document set.
- **Keywords (Source Terms):** E.g., "bracket", "cover". Acts as the grouping node.
- **Concepts:** Unique definitions (e.g., "Rigid structural component"). String-based uniqueness ensures identical AI outputs collapse into a single concept.

---

## 🏁 Getting Started

### Prerequisites
* Node.js >= 22
* GraphicsMagick (`brew install graphicsmagick` on macOS)
* Google Gemini API Key

### Installation

1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```

2. Set up environment variables:
   Create a `.env` file in the `backend/` directory:
   ```env
   GEMINI_API_KEY=your_api_key_here
   JWT_SECRET=your_jwt_secret_here
   ```

3. Initialize the database:
   ```bash
   npm run db:push
   ```

### Development
Run the development servers concurrently (frontend, backend, and database schema watcher):
```bash
npm run dev
```

### Production Build
```bash
npm run build
npm start
```

---

## 🔮 Future Work

Future versions may introduce document-wide concept analysis, including automatic clustering of concepts, concept merging/splitting recommendations, and multilingual terminology generation. The MVP provides the foundation for these capabilities while remaining simple, explainable, and practical.
