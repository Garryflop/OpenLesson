"""English demo content for ``python -m app.seed --reset --lang en`` (fictional people only).

Used for English-language screenshots and demos; the structure mirrors the Russian lists in seed.py.
"""

SCHOOL_SE = "School of Software Engineering"
SCHOOL_GE = "School of General Education"

STAFF = [
    ("Seitkazina Dinara Maratovna", "d.seitkazina", "Platform administrator (demo)", None, ["admin"], None),
    ("Zhumabekova Assel Erlanovna", "a.zhumabekova", "Methodologist (demo)", None, ["methodist"], None),
    ("Kassymov Nurlan Bakytovich", "n.kassymov", "Dean (demo)", SCHOOL_SE, ["dean"], SCHOOL_SE),
    ("Ibrayeva Gulnara Kairatovna", "g.ibrayeva", "Deputy dean (demo)", SCHOOL_GE, ["dean"], SCHOOL_GE),
    ("Omarov Yerlan Serikovich", "e.omarov", "Vice-rector for academic affairs (demo)", None, ["leadership"], None),
]

FALLBACK_TEACHERS = [
    ("Akhmetova Aigerim Serikovna", SCHOOL_SE),
    ("Nurlanov Daniyar Askaruly", "School of Cybersecurity"),
    ("Smagulova Zhanar Bolatovna", SCHOOL_GE),
    ("Kim Viktor Alexandrovich", "School of Artificial Intelligence and Data Science"),
    ("Yessenova Madina Talgatovna", "School of Artificial Intelligence and Data Science"),
    ("Bekmukhanov Arman Yerbolovich", SCHOOL_SE),
    ("Tulegenova Aizhan Muratovna", "School of Creative Industries"),
    ("Abdrakhmanov Timur Ruslanovich", "School of Cybersecurity"),
    ("Sarsenbayeva Aliya Nurlanovna", SCHOOL_GE),
    ("Petrov Alexei Igorevich", "School of Intelligent Systems"),
    ("Zhaksylykova Kamila Yerikovna", "School of Artificial Intelligence and Data Science"),
    ("Muratov Yerassyl Kanatovich", SCHOOL_SE),
    ("Ismailova Sabina Rashidovna", SCHOOL_GE),
    ("Dauletov Nursultan Maratovich", "School of Intelligent Systems"),
    ("Ospanova Dana Serikovna", "School of Creative Industries"),
    ("Beissenov Olzhas Galymuly", "School of Digital Public Administration"),
    ("Rakhimova Laura Askarovna", "School of Artificial Intelligence and Data Science"),
]

MOCKUP_TOPIC = ("Interactive teaching methods", "Pedagogy")

TOPICS = [
    ("Interactive teaching methods in programming", "Introduction to Programming"),
    ("Artificial intelligence in education", "Information Technology"),
    ("Designing REST APIs with FastAPI", "Web Development"),
    ("Normalising relational databases", "Databases"),
    ("Web application attacks and defences (OWASP Top 10)", "Information Security"),
    ("Linear regression and least squares", "Machine Learning"),
    ("Storytelling in digital media", "Digital Journalism"),
    ("Academic writing: structure of a research paper", "Academic English"),
    ("Graphs and shortest-path algorithms", "Discrete Mathematics"),
    ("Containerising applications with Docker", "DevOps"),
    ("TCP/IP network protocols in practice", "Computer Networks"),
    ("Agile and Scrum: roles and artefacts", "IT Project Management"),
    ("History of Kazakhstan in the digital age", "Modern History of Kazakhstan"),
    ("Numerical methods for solving equations", "Computational Mathematics"),
    ("UX research and prototyping in Figma", "Interface Design"),
    ("Microcontrollers and IoT devices", "Computer Architecture"),
    ("Neural networks: from the perceptron to CNNs", "Deep Learning"),
    ("Critical thinking and argumentation", "Philosophy"),
    ("Software testing: unit and integration tests", "Software Quality"),
    ("Kazakh for IT: professional vocabulary", "Kazakh Language"),
    ("Probabilistic models in data analysis", "Probability Theory"),
    ("Public-key cryptography", "Cryptography"),
    ("Media literacy and fact-checking", "Media and Communications"),
    ("Cloud computing: IaaS, PaaS and SaaS", "Cloud Technologies"),
    ("GoF design patterns", "Object-Oriented Design"),
    ("Public speaking in English", "Professional English"),
    ("Big Data: the Hadoop and Spark ecosystem", "Big Data Processing"),
    ("Economics of digital platforms", "Digital Economy"),
    ("Computer vision with OpenCV", "Computer Vision"),
    ("Mobile development with Flutter", "Mobile Development"),
    ("Ethics of artificial intelligence", "AI and Society"),
    ("Matrices and linear transformations", "Linear Algebra"),
]

STRENGTHS = [
    "A clear structure: each stage followed logically from the previous one.",
    "Great use of Mentimeter to check understanding in real time.",
    "Students worked actively in groups; the atmosphere was friendly and focused.",
    "Practical examples from industry made the material clear and relevant.",
    "The teacher knows the subject well and leads the discussion skilfully.",
    "A well-planned reflection at the end — students formulated the conclusions themselves.",
    "An interesting case solved in teams sparked a lively discussion.",
    "Clear slides with good visualisations of complex concepts.",
]
IMPROVEMENTS = [
    "Leave a little more time for students' questions at the end.",
    "The second part was a bit fast — some students could not keep up with notes.",
    "Try to involve the students in the back rows more often.",
    "Consider a short quiz at the start to activate prior knowledge.",
    "Some slides have too much text — shorten them and add diagrams.",
    "Link the homework more closely to the practical part of the lesson.",
]
COMMENTS = [
    "Thank you for the open lesson — I will use several techniques in my own classes.",
    "A useful experience for colleagues in the department.",
    "",
    "I would like to see this topic continued in the next open lesson.",
    "The lesson meets current expectations for active learning.",
]

PLAN = {
    "heading": "Open lesson plan: {topic}",
    "discipline": "Course: {discipline}",
    "teacher": "Teacher: {teacher}, {position}",
    "duration": "Duration: {minutes} minutes",
    "goal_h": "Lesson goal",
    "goal": "Students understand the topic “{topic}” and can apply it in practice.",
    "tasks_h": "Objectives",
    "tasks": ("activate prior knowledge", "explain the key concepts", "consolidate the material in a practical task"),
    "outcomes_h": "Expected learning outcomes",
    "outcomes": "By the end of the lesson students will know the key concepts of the topic and be able to apply them "
                "when solving problems; the result is checked with a mini quiz.",
    "flow_h": "Lesson flow",
    "stages": [("Organisation, setting the goal", 5), ("Activating knowledge: Mentimeter quiz", 10),
               ("New material with slides", 15), ("Group work on a case, discussion", 15), ("Reflection and summary", 5)],
    "stages_weak": [("New material", 35), ("Questions and answers", 15)],
    "stage": "Stage",
    "minutes": "Time, min",
    "methods_h": "Interactive methods and digital tools",
    "methods": "Discussion, peer review, case method; digital tools: Mentimeter, Miro, Moodle (LMS).",
    "slides": ("Lesson goals", "Key concepts", "Practical task", "Reflection"),
    "bullets": "• Point 1\n• Point 2\n• Point 3",
}
