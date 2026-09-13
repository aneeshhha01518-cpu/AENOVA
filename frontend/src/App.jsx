import { useEffect, useMemo, useState } from "react";
import "./App.css";

import AENOVALogo from "./assets/AENOVA-logo.png";
import HeroStudent from "./assets/HeroStudent.png";

const API = "https://aenova.onrender.com";

/* =========================================================
   HELPERS
   ========================================================= */

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value) {
  return normalizeText(value)
    .split(/[\s,;/|]+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 2);
}

function uniqueWords(value) {
  return [...new Set(tokenize(value))];
}

/* =========================================================
   REAL OPPORTUNITY RECOMMENDATION ENGINE
   Supports all departments and fields.
   ========================================================= */

function calculateRecommendation(opportunity, profile, feedback) {
  const skills = uniqueWords(profile.skills);
  const interests = uniqueWords(profile.interests);
  const career = uniqueWords(profile.career_goal);
  const department = uniqueWords(profile.department);
  const location = uniqueWords(profile.location);

  const opportunityText = normalizeText(
    [
      opportunity.title,
      opportunity.description,
      opportunity.category,
      opportunity.organization,
      opportunity.skills_required,
      opportunity.field,
      opportunity.eligibility,
      opportunity.location,
      opportunity.mode,
    ].join(" ")
  );

  const opportunityTokens = new Set(
    uniqueWords(opportunityText)
  );

  const matchedSkills = skills.filter(
    (word) =>
      opportunityTokens.has(word) ||
      opportunityText.includes(word)
  );

  const matchedInterests = interests.filter(
    (word) =>
      opportunityTokens.has(word) ||
      opportunityText.includes(word)
  );

  const matchedCareer = career.filter(
    (word) =>
      opportunityTokens.has(word) ||
      opportunityText.includes(word)
  );

  const matchedDepartment = department.filter(
    (word) =>
      opportunityTokens.has(word) ||
      opportunityText.includes(word)
  );

  const matchedLocation = location.filter(
    (word) =>
      opportunityTokens.has(word) ||
      opportunityText.includes(word)
  );

  let score = 20;

  score += Math.min(
    matchedSkills.length * 12,
    36
  );

  score += Math.min(
    matchedInterests.length * 9,
    27
  );

  score += Math.min(
    matchedCareer.length * 8,
    16
  );

  score += Math.min(
    matchedDepartment.length * 12,
    20
  );

  score += Math.min(
    matchedLocation.length * 5,
    10
  );

  const careerGoal = normalizeText(
    profile.career_goal
  );

  const careerGroups = [
    [
      [
        "software",
        "developer",
        "development",
        "coding",
        "programming",
      ],
      [
        "software",
        "developer",
        "development",
        "coding",
        "programming",
      ],
    ],
    [
      [
        "data",
        "analytics",
        "analyst",
        "statistics",
      ],
      [
        "data",
        "analytics",
        "analyst",
        "statistics",
      ],
    ],
    [
      [
        "ai",
        "artificial intelligence",
        "machine learning",
        "ml",
      ],
      [
        "ai",
        "artificial intelligence",
        "machine learning",
        "ml",
      ],
    ],
    [
      [
        "finance",
        "financial",
        "accounting",
        "investment",
      ],
      [
        "finance",
        "financial",
        "accounting",
        "investment",
      ],
    ],
    [
      [
        "marketing",
        "branding",
        "digital marketing",
      ],
      [
        "marketing",
        "branding",
        "digital marketing",
      ],
    ],
    [
      [
        "design",
        "ui",
        "ux",
        "graphic",
        "creative",
      ],
      [
        "design",
        "ui",
        "ux",
        "graphic",
        "creative",
      ],
    ],
    [
      [
        "mechanical",
        "automobile",
        "manufacturing",
        "cad",
        "solidworks",
      ],
      [
        "mechanical",
        "automobile",
        "manufacturing",
        "cad",
        "solidworks",
      ],
    ],
    [
      [
        "civil",
        "construction",
        "structural",
        "architecture",
      ],
      [
        "civil",
        "construction",
        "structural",
        "architecture",
      ],
    ],
    [
      [
        "electronics",
        "embedded",
        "ece",
        "electrical",
        "iot",
        "vlsi",
      ],
      [
        "electronics",
        "embedded",
        "ece",
        "electrical",
        "iot",
        "vlsi",
      ],
    ],
    [
      [
        "biotech",
        "biotechnology",
        "biology",
        "pharma",
        "life science",
      ],
      [
        "biotech",
        "biotechnology",
        "biology",
        "pharma",
        "life science",
      ],
    ],
    [
      [
        "law",
        "legal",
        "lawyer",
        "compliance",
      ],
      [
        "law",
        "legal",
        "lawyer",
        "compliance",
      ],
    ],
    [
      [
        "agriculture",
        "agri",
        "farming",
        "agritech",
      ],
      [
        "agriculture",
        "agri",
        "farming",
        "agritech",
      ],
    ],
    [
      [
        "management",
        "business",
        "mba",
        "operations",
        "hr",
      ],
      [
        "management",
        "business",
        "mba",
        "operations",
        "hr",
      ],
    ],
  ];

  careerGroups.forEach(([goalWords, opportunityWords]) => {
    const goalMatch = goalWords.some(
      (word) => careerGoal.includes(word)
    );

    const opportunityMatch = opportunityWords.some(
      (word) => opportunityText.includes(word)
    );

    if (goalMatch && opportunityMatch) {
      score += 10;
    }
  });

  const feedbackKey = String(
    opportunity.id ||
      opportunity.title ||
      ""
  );

  if (feedback[feedbackKey] === "like") {
    score += 12;
  }

  if (feedback[feedbackKey] === "dislike") {
    score -= 20;
  }

  score = Math.max(
    0,
    Math.min(100, Math.round(score))
  );

  const reasons = [];

  if (matchedSkills.length) {
    reasons.push(
      `matches your skills: ${matchedSkills
        .slice(0, 3)
        .join(", ")}`
    );
  }

  if (matchedInterests.length) {
    reasons.push(
      `matches your interests: ${matchedInterests
        .slice(0, 3)
        .join(", ")}`
    );
  }

  if (matchedCareer.length) {
    reasons.push(
      "connects with your career goal"
    );
  }

  if (matchedDepartment.length) {
    reasons.push(
      "is relevant to your department"
    );
  }

  if (matchedLocation.length) {
    reasons.push(
      "has a location connection"
    );
  }

  if (!reasons.length) {
    reasons.push(
      "may help you explore a new area"
    );
  }

  let level = "Possible match";

  if (score >= 75) {
    level = "Strong match";
  } else if (score >= 55) {
    level = "Good match";
  } else if (score >= 35) {
    level = "Potential match";
  }

  return {
    score,
    level,
    reasons,
    matchedSkills,
    matchedInterests,
    matchedCareer,
  };
}

/* =========================================================
   MARKDOWN / URL RENDERING
   ========================================================= */

function formatInlineText(text) {
  if (!text) return null;

  const parts = String(text).split(
    /(\[[^\]]+\]\(https?:\/\/[^)]+\)|https?:\/\/[^\s]+|\*\*.*?\*\*|\*.*?\*|`.*?`)/g
  );

  return parts.map((part, index) => {
    const markdownLink = part.match(
      /^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/
    );

    if (markdownLink) {
      return (
        <a
          key={index}
          href={markdownLink[2]}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: "#5b55e8",
            fontWeight: "800",
            textDecoration: "underline",
            wordBreak: "break-all",
          }}
        >
          {markdownLink[1]}
        </a>
      );
    }

    if (
      part.startsWith("http://") ||
      part.startsWith("https://")
    ) {
      let cleanUrl = part;
      let ending = "";

      while (/[.,!?;:]$/.test(cleanUrl)) {
        ending =
          cleanUrl.slice(-1) + ending;
        cleanUrl = cleanUrl.slice(0, -1);
      }

      return (
        <span key={index}>
          <a
            href={cleanUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: "#5b55e8",
              fontWeight: "800",
              textDecoration: "underline",
              wordBreak: "break-all",
            }}
          >
            {cleanUrl}
          </a>
          {ending}
        </span>
      );
    }

    if (
      part.startsWith("**") &&
      part.endsWith("**")
    ) {
      return (
        <strong key={index}>
          {part.slice(2, -2)}
        </strong>
      );
    }

    if (
      part.startsWith("*") &&
      part.endsWith("*") &&
      !part.startsWith("**")
    ) {
      return (
        <em key={index}>
          {part.slice(1, -1)}
        </em>
      );
    }

    if (
      part.startsWith("`") &&
      part.endsWith("`")
    ) {
      return (
        <code
          key={index}
          style={{
            background:
              "rgba(99,88,232,0.10)",
            padding: "2px 5px",
            borderRadius: "4px",
            fontFamily:
              "Consolas, Monaco, monospace",
          }}
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    return <span key={index}>{part}</span>;
  });
}

function renderAIText(text) {
  if (!text) return null;

  const lines = String(text).split("\n");

  let insideCode = false;
  let codeLanguage = "";
  let codeLines = [];

  const elements = [];

  const addCodeBlock = () => {
    elements.push(
      <div
        key={`code-${elements.length}`}
        style={{
          margin: "12px 0",
          borderRadius: "10px",
          overflow: "hidden",
          background: "#171923",
          color: "#f5f7ff",
        }}
      >
        {codeLanguage && (
          <div
            style={{
              padding: "7px 12px",
              background: "#202331",
              color: "#b8bed8",
              fontSize: "10px",
              fontWeight: "700",
              textTransform: "uppercase",
            }}
          >
            {codeLanguage}
          </div>
        )}

        <pre
          style={{
            margin: 0,
            padding: "14px",
            overflowX: "auto",
            fontSize: "12px",
            lineHeight: "1.6",
            fontFamily:
              "Consolas, Monaco, monospace",
            whiteSpace: "pre-wrap",
          }}
        >
          <code>
            {codeLines.join("\n")}
          </code>
        </pre>
      </div>
    );

    codeLines = [];
    codeLanguage = "";
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      if (!insideCode) {
        insideCode = true;
        codeLanguage = trimmed
          .replace(/^```/, "")
          .trim();
      } else {
        insideCode = false;
        addCodeBlock();
      }
      return;
    }

    if (insideCode) {
      codeLines.push(line);
      return;
    }

    if (!trimmed) {
      elements.push(
        <div
          key={`space-${index}`}
          style={{ height: "7px" }}
        />
      );
      return;
    }

    if (trimmed.startsWith("# ")) {
      elements.push(
        <h3
          key={index}
          style={{
            margin: "12px 0 7px",
            fontSize: "18px",
            fontWeight: "800",
          }}
        >
          {formatInlineText(
            trimmed.slice(2)
          )}
        </h3>
      );
      return;
    }

    if (
      trimmed.startsWith("## ") ||
      trimmed.startsWith("### ")
    ) {
      const heading = trimmed.startsWith("### ")
        ? trimmed.slice(4)
        : trimmed.slice(3);

      elements.push(
        <h4
          key={index}
          style={{
            margin: "11px 0 6px",
            fontSize: "15px",
            fontWeight: "800",
          }}
        >
          {formatInlineText(heading)}
        </h4>
      );
      return;
    }

    if (
      trimmed === "---" ||
      trimmed === "***"
    ) {
      elements.push(
        <hr
          key={index}
          style={{
            border: "none",
            borderTop:
              "1px solid rgba(80,80,120,0.15)",
            margin: "12px 0",
          }}
        />
      );
      return;
    }

    if (
      trimmed.startsWith("- ") ||
      trimmed.startsWith("* ")
    ) {
      elements.push(
        <div
          key={index}
          style={{
            display: "flex",
            gap: "8px",
            marginBottom: "6px",
          }}
        >
          <span>•</span>
          <span>
            {formatInlineText(
              trimmed.slice(2)
            )}
          </span>
        </div>
      );
      return;
    }

    const numbered = trimmed.match(
      /^(\d+)\.\s+(.*)$/
    );

    if (numbered) {
      elements.push(
        <div
          key={index}
          style={{
            display: "flex",
            gap: "8px",
            marginBottom: "6px",
          }}
        >
          <strong>{numbered[1]}.</strong>
          <span>
            {formatInlineText(
              numbered[2]
            )}
          </span>
        </div>
      );
      return;
    }

    elements.push(
      <div
        key={index}
        style={{ marginBottom: "7px" }}
      >
        {formatInlineText(trimmed)}
      </div>
    );
  });

  if (insideCode) {
    addCodeBlock();
  }

  return elements;
}

/* =========================================================
   MAIN APP
   ========================================================= */

function App() {
  /* =======================================================
     OPPORTUNITIES
     ======================================================= */

  const [
    selectedCategory,
    setSelectedCategory,
  ] = useState("All");

  const [
    opportunities,
    setOpportunities,
  ] = useState([]);

  const [
    loadingOpportunities,
    setLoadingOpportunities,
  ] = useState(true);

  /* =======================================================
     PROFILE
     ======================================================= */

  const [
    profile,
    setProfile,
  ] = useState(() => {
    try {
      const saved =
        localStorage.getItem(
          "aenova_profile"
        );

      return saved
        ? JSON.parse(saved)
        : {
            full_name: "",
            email: "",
            college: "",
            department: "",
            study_year: "",
            location: "",
            skills: "",
            interests: "",
            career_goal: "",
          };
    } catch {
      return {
        full_name: "",
        email: "",
        college: "",
        department: "",
        study_year: "",
        location: "",
        skills: "",
        interests: "",
        career_goal: "",
      };
    }
  });

  const [
    profileId,
    setProfileId,
  ] = useState(() => {
    const saved =
      localStorage.getItem(
        "aenova_profile_id"
      );

    return saved ? Number(saved) : null;
  });

  const [
    profileStep,
    setProfileStep,
  ] = useState(1);

  const [
    profileMessage,
    setProfileMessage,
  ] = useState("");

  const [
    savingProfile,
    setSavingProfile,
  ] = useState(false);

  /* =======================================================
     FEEDBACK
     ======================================================= */

  const [
    feedback,
    setFeedback,
  ] = useState(() => {
    try {
      const saved =
        localStorage.getItem(
          "aenova_feedback"
        );

      return saved
        ? JSON.parse(saved)
        : {};
    } catch {
      return {};
    }
  });

  /* =======================================================
     CHAT
     ======================================================= */

  const [
    messages,
    setMessages,
  ] = useState([
    {
      id: "welcome",
      sender: "bot",
      text:
        "Hey! 👋 I'm ANEBESTRA, your AI assistant inside AENOVA. What are you working on today?",
    },
  ]);

  const [
    chatMessage,
    setChatMessage,
  ] = useState("");

  const [
    sendingMessage,
    setSendingMessage,
  ] = useState(false);

  const [
    sessionId,
    setSessionId,
  ] = useState(() => {
    const saved =
      localStorage.getItem(
        "aenova_anebestra_session"
      );

    if (saved) return saved;

    const newSession =
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID ===
        "function"
        ? crypto.randomUUID()
        : `aenova-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2)}`;

    localStorage.setItem(
      "aenova_anebestra_session",
      newSession
    );

    return newSession;
  });

  /* =======================================================
     PERSIST PROFILE LOCALLY
     ======================================================= */

  useEffect(() => {
    localStorage.setItem(
      "aenova_profile",
      JSON.stringify(profile)
    );
  }, [profile]);

  /* =======================================================
     PERSIST FEEDBACK LOCALLY
     ======================================================= */

  useEffect(() => {
    localStorage.setItem(
      "aenova_feedback",
      JSON.stringify(feedback)
    );
  }, [feedback]);

  /* =======================================================
     LOAD CHAT HISTORY
     ======================================================= */

  useEffect(() => {
    fetch(
      `${API}/api/chat/history/${encodeURIComponent(
        sessionId
      )}`
    )
      .then((response) =>
        response.json()
      )
      .then((data) => {
        if (
          data &&
          data.success &&
          Array.isArray(data.messages) &&
          data.messages.length > 0
        ) {
          setMessages(
            data.messages.map(
              (item, index) => ({
                id:
                  `history-${
                    item.id || index
                  }`,
                sender:
                  item.role ===
                  "assistant"
                    ? "bot"
                    : "user",
                text:
                  item.message || "",
              })
            )
          );
        }

        if (data?.profile_id) {
          setProfileId(
            Number(data.profile_id)
          );

          localStorage.setItem(
            "aenova_profile_id",
            String(data.profile_id)
          );
        }
      })
      .catch((error) => {
        console.error(
          "Chat history error:",
          error
        );
      });
  }, [sessionId]);

  /* =======================================================
     LOAD OPPORTUNITIES
     ======================================================= */

  useEffect(() => {
    setLoadingOpportunities(true);

    fetch(
      `${API}/api/opportunities`
    )
      .then((response) =>
        response.json()
      )
      .then((data) => {
        if (
          data &&
          Array.isArray(
            data.opportunities
          )
        ) {
          setOpportunities(
            data.opportunities
          );
        } else if (
          Array.isArray(data)
        ) {
          setOpportunities(data);
        } else {
          setOpportunities([]);
        }
      })
      .catch((error) => {
        console.error(
          "Opportunity error:",
          error
        );

        setOpportunities([]);
      })
      .finally(() => {
        setLoadingOpportunities(
          false
        );
      });
  }, []);

  /* =======================================================
     RECOMMENDATIONS
     ======================================================= */

  const recommendations = useMemo(() => {
    return opportunities
      .map((opportunity) => ({
        opportunity,
        analysis:
          calculateRecommendation(
            opportunity,
            profile,
            feedback
          ),
      }))
      .sort(
        (a, b) =>
          b.analysis.score -
          a.analysis.score
      );
  }, [
    opportunities,
    profile,
    feedback,
  ]);

  const topRecommendations =
    recommendations
      .filter(
        (item) =>
          item.analysis.score >= 35
      )
      .slice(0, 6);

  const [
    recommendationMode,
    setRecommendationMode,
  ] = useState("recommended");

  /* =======================================================
     FILTERED OPPORTUNITIES
     ======================================================= */

  const filteredOpportunities =
    selectedCategory === "All"
      ? opportunities
      : opportunities.filter(
          (opportunity) =>
            String(
              opportunity.category ||
                ""
            ).toLowerCase() ===
            selectedCategory.toLowerCase()
        );

  /* =======================================================
     PROFILE UPDATE
     ======================================================= */

  const updateProfile = (
    field,
    value
  ) => {
    setProfile((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  /* =======================================================
     SAVE PROFILE
     ======================================================= */

  const saveProfile =
    async () => {
      setProfileMessage("");

      if (!profile.full_name.trim()) {
        setProfileMessage(
          "Please enter your full name."
        );
        setProfileStep(1);
        return;
      }

      if (!profile.email.trim()) {
        setProfileMessage(
          "Please enter your email address."
        );
        setProfileStep(1);
        return;
      }

      if (!profile.college.trim()) {
        setProfileMessage(
          "Please enter your college name."
        );
        setProfileStep(2);
        return;
      }

      if (!profile.department.trim()) {
        setProfileMessage(
          "Please enter your department."
        );
        setProfileStep(2);
        return;
      }

      if (!profile.skills.trim()) {
        setProfileMessage(
          "Please add at least one skill."
        );
        setProfileStep(4);
        return;
      }

      if (!profile.interests.trim()) {
        setProfileMessage(
          "Please add your interests."
        );
        setProfileStep(4);
        return;
      }

      if (!profile.career_goal.trim()) {
        setProfileMessage(
          "Please enter your career goal."
        );
        setProfileStep(5);
        return;
      }

      setSavingProfile(true);

      try {
        const response =
          await fetch(
            `${API}/api/profile`,
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body:
                JSON.stringify(
                  profile
                ),
            }
          );

        const data =
          await response.json();

        if (
          response.ok &&
          data.success !== false
        ) {
          if (data.profile_id) {
            setProfileId(
              Number(data.profile_id)
            );

            localStorage.setItem(
              "aenova_profile_id",
              String(data.profile_id)
            );
          }

          setProfileMessage(
            "✓ Your profile has been saved successfully!"
          );

          setProfileStep(5);
        } else {
          setProfileMessage(
            data.message ||
              data.detail ||
              "Unable to save your profile."
          );
        }
      } catch (error) {
        console.error(
          "Profile save error:",
          error
        );

        setProfileMessage(
          "Backend connection failed."
        );
      } finally {
        setSavingProfile(false);
      }
    };

  /* =======================================================
     FEEDBACK
     ======================================================= */

  const giveFeedback = (
    opportunity,
    type
  ) => {
    const key = String(
      opportunity.id ||
        opportunity.title ||
        ""
    );

    setFeedback((previous) => {
      const updated = {
        ...previous,
      };

      if (updated[key] === type) {
        delete updated[key];
      } else {
        updated[key] = type;
      }

      return updated;
    });

    fetch(
      `${API}/api/feedback`,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          session_id:
            sessionId,
          profile_id:
            profileId,
          opportunity_id:
            opportunity.id ||
            null,
          feedback_type:
            type,
        }),
      }
    ).catch((error) => {
      console.error(
        "Feedback save error:",
        error
      );
    });
  };

  /* =======================================================
     SEND CHAT MESSAGE
     ======================================================= */

  const sendMessage =
    async () => {
      const message =
        chatMessage.trim();

      if (
        !message ||
        sendingMessage
      ) {
        return;
      }

      const now = Date.now();

      const thinkingId =
        `thinking-${now}`;

      setMessages(
        (previous) => [
          ...previous,
          {
            id:
              `user-${now}`,
            sender: "user",
            text: message,
          },
          {
            id: thinkingId,
            sender: "bot",
            text: "",
            isThinking: true,
          },
        ]
      );

      setChatMessage("");
      setSendingMessage(true);

      try {
        const response =
          await fetch(
            `${API}/api/chat`,
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify({
                message,
                session_id:
                  sessionId,
                profile_id:
                  profileId,
                profile: {
                  full_name:
                    profile.full_name,
                  email:
                    profile.email,
                  college:
                    profile.college,
                  department:
                    profile.department,
                  study_year:
                    profile.study_year,
                  location:
                    profile.location,
                  skills:
                    profile.skills,
                  interests:
                    profile.interests,
                  career_goal:
                    profile.career_goal,
                },
              }),
            }
          );

        const data =
          await response.json();

        if (
          !response.ok ||
          !data.success
        ) {
          setMessages(
            (previous) =>
              previous.map(
                (item) =>
                  item.id ===
                  thinkingId
                    ? {
                        ...item,
                        text:
                          data.reply ||
                          data.message ||
                          data.detail ||
                          "Sorry, I couldn't answer that right now.",
                        isThinking:
                          false,
                      }
                    : item
              )
          );

          return;
        }

        if (data.profile_id) {
          setProfileId(
            Number(data.profile_id)
          );

          localStorage.setItem(
            "aenova_profile_id",
            String(data.profile_id)
          );
        }

        const reply =
          data.reply ||
          "I'm here. What would you like to explore?";

        setMessages(
          (previous) =>
            previous.map(
              (item) =>
                item.id ===
                thinkingId
                  ? {
                      ...item,
                      text: "",
                      isThinking:
                        false,
                      isStreaming:
                        true,
                    }
                  : item
            )
        );

        let currentText = "";

        for (
          let i = 0;
          i < reply.length;
          i++
        ) {
          currentText +=
            reply[i];

          setMessages(
            (previous) =>
              previous.map(
                (item) =>
                  item.id ===
                  thinkingId
                    ? {
                        ...item,
                        text:
                          currentText,
                        isThinking:
                          false,
                        isStreaming:
                          true,
                      }
                    : item
              )
          );

          await new Promise(
            (resolve) =>
              setTimeout(
                resolve,
                5
              )
          );
        }

        setMessages(
          (previous) =>
            previous.map(
              (item) =>
                item.id ===
                thinkingId
                  ? {
                      ...item,
                      text: reply,
                      isThinking:
                        false,
                      isStreaming:
                        false,
                    }
                  : item
            )
        );
      } catch (error) {
        console.error(
          "ANEBESTRA error:",
          error
        );

        setMessages(
          (previous) =>
            previous.map(
              (item) =>
                item.id ===
                thinkingId
                  ? {
                      ...item,
                      text:
                        "I couldn't connect to the AENOVA AI service. Please try again.",
                      isThinking:
                        false,
                      isStreaming:
                        false,
                    }
                  : item
            )
        );
      } finally {
        setSendingMessage(false);
      }
    };

  /* =======================================================
     NEW CHAT
     ======================================================= */

  const startNewChat =
    () => {
      const newSession =
        typeof crypto !==
          "undefined" &&
        typeof crypto.randomUUID ===
          "function"
          ? crypto.randomUUID()
          : `aenova-${Date.now()}-${Math.random()
              .toString(36)
              .slice(2)}`;

      localStorage.setItem(
        "aenova_anebestra_session",
        newSession
      );

      setSessionId(newSession);

      setMessages([
        {
          id:
            `welcome-${Date.now()}`,
          sender: "bot",
          text:
            "Fresh conversation started. 👋 What would you like to work on?",
        },
      ]);
    };

  const handleChatKeyDown =
    (event) => {
      if (
        event.key === "Enter" &&
        !event.shiftKey
      ) {
        event.preventDefault();
        sendMessage();
      }
    };

  /* =======================================================
     RECOMMENDATION CARD
     ======================================================= */

  const RecommendationCard =
    ({
      item,
      featured = false,
    }) => {
      const opportunity =
        item.opportunity;

      const analysis =
        item.analysis;

      const key = String(
        opportunity.id ||
          opportunity.title ||
          ""
      );

      const currentFeedback =
        feedback[key];

      return (
        <div
          className="recommendation-card"
          style={{
            position:
              "relative",
            background:
              "#ffffff",
            border:
              featured
                ? "2px solid #6658e8"
                : "1px solid #e7e7f3",
            borderRadius:
              "18px",
            padding: "20px",
            boxShadow:
              featured
                ? "0 12px 35px rgba(92,82,220,0.14)"
                : "0 8px 25px rgba(40,40,100,0.06)",
            boxSizing:
              "border-box",
            height: "100%",
          }}
        >
          <div
            style={{
              display:
                "flex",
              alignItems:
                "center",
              justifyContent:
                "space-between",
              marginBottom:
                "12px",
            }}
          >
            <span
              style={{
                padding:
                  "6px 10px",
                borderRadius:
                  "999px",
                background:
                  analysis.score >=
                  75
                    ? "#e9f8f1"
                    : analysis.score >=
                      55
                    ? "#eef1ff"
                    : "#f5f5fb",
                color:
                  analysis.score >=
                  75
                    ? "#16866f"
                    : "#5c55d9",
                fontSize:
                  "11px",
                fontWeight:
                  "800",
              }}
            >
              {analysis.level}
            </span>

            <span
              style={{
                fontSize:
                  "20px",
                fontWeight:
                  "900",
                color:
                  "#5e55df",
              }}
            >
              {analysis.score}%
            </span>
          </div>

          <div
            style={{
              fontSize:
                "11px",
              color: "#777",
              fontWeight:
                "700",
              textTransform:
                "uppercase",
              marginBottom:
                "7px",
            }}
          >
            {opportunity.category ||
              "Opportunity"}
          </div>

          <h3
            style={{
              margin:
                "0 0 9px",
              color:
                "#181b38",
              fontSize:
                "17px",
              lineHeight:
                "1.35",
            }}
          >
            {opportunity.title ||
              "Opportunity"}
          </h3>

          <p
            style={{
              margin:
                "0 0 12px",
              color:
                "#64667d",
              fontSize:
                "13px",
              lineHeight:
                "1.55",
            }}
          >
            {opportunity.description ||
              "See the official listing for complete details."}
          </p>

          <div
            style={{
              background:
                "#f6f5ff",
              borderRadius:
                "12px",
              padding:
                "12px",
              marginBottom:
                "13px",
            }}
          >
            <div
              style={{
                fontSize:
                  "11px",
                fontWeight:
                  "800",
                color:
                  "#5c55d9",
                marginBottom:
                  "5px",
              }}
            >
              ✦ WHY AENOVA RECOMMENDS THIS
            </div>

            <div
              style={{
                fontSize:
                  "12px",
                color:
                  "#45465e",
                lineHeight:
                  "1.5",
              }}
            >
              {analysis.reasons
                .slice(0, 3)
                .map(
                  (reason, index) => (
                    <div
                      key={
                        index
                      }
                    >
                      • {reason}
                    </div>
                  )
                )}
            </div>
          </div>

          <div
            style={{
              display:
                "flex",
              flexDirection:
                "column",
              gap: "5px",
              marginBottom:
                "15px",
              fontSize:
                "11px",
              color:
                "#77788d",
            }}
          >
            {opportunity.location && (
              <span>
                📍{" "}
                {opportunity.location}
              </span>
            )}

            {opportunity.organization && (
              <span>
                🏢{" "}
                {opportunity.organization}
              </span>
            )}

            {opportunity.deadline && (
              <span>
                📅 Registration:{" "}
                {opportunity.deadline}
              </span>
            )}

            {opportunity.event_date && (
              <span>
                🗓 Event:{" "}
                {opportunity.event_date}
              </span>
            )}
          </div>

          <div
            style={{
              display:
                "flex",
              alignItems:
                "center",
              justifyContent:
                "space-between",
              marginBottom:
                "10px",
            }}
          >
            <span
              style={{
                fontSize:
                  "11px",
                color:
                  "#88899c",
              }}
            >
              Is this recommendation useful?
            </span>

            <div
              style={{
                display:
                  "flex",
                gap: "6px",
              }}
            >
              <button
                type="button"
                onClick={() =>
                  giveFeedback(
                    opportunity,
                    "like"
                  )
                }
                style={{
                  border:
                    currentFeedback ===
                    "like"
                      ? "1px solid #4baf8f"
                      : "1px solid #e4e4ef",
                  background:
                    currentFeedback ===
                    "like"
                      ? "#eaf8f3"
                      : "#fff",
                  borderRadius:
                    "8px",
                  cursor:
                    "pointer",
                  padding:
                    "5px 9px",
                }}
              >
                👍
              </button>

              <button
                type="button"
                onClick={() =>
                  giveFeedback(
                    opportunity,
                    "dislike"
                  )
                }
                style={{
                  border:
                    currentFeedback ===
                    "dislike"
                      ? "1px solid #d98a8a"
                      : "1px solid #e4e4ef",
                  background:
                    currentFeedback ===
                    "dislike"
                      ? "#fff0f0"
                      : "#fff",
                  borderRadius:
                    "8px",
                  cursor:
                    "pointer",
                  padding:
                    "5px 9px",
                }}
              >
                👎
              </button>
            </div>
          </div>

          {opportunity.url ? (
            <a
              href={
                opportunity.url
              }
              target="_blank"
              rel="noopener noreferrer"
              className="view-button"
              style={{
                display:
                  "block",
                textAlign:
                  "center",
                textDecoration:
                  "none",
              }}
            >
              View Official Listing →
            </a>
          ) : (
            <button
              type="button"
              className="view-button"
              disabled
              style={{
                width: "100%",
              }}
            >
              Official listing unavailable
            </button>
          )}
        </div>
      );
    };

  /* =======================================================
     RENDER
     ======================================================= */

  return (
    <div className="app">

      {/* NAVBAR */}
      <nav className="navbar">
        <a
          href="#home"
          className="logo-link"
        >
          <img
            src={AENOVALogo}
            alt="AENOVA"
            className="aenova-logo"
          />
        </a>

        <div className="nav-links">
          <a href="#home">
            Home
          </a>
          <a href="#features">
            Features
          </a>
          <a href="#how-it-works">
            How it works
          </a>
          <a href="#recommendations">
            AI Matches
          </a>
          <a href="#opportunities">
            Opportunities
          </a>
          <a href="#assistant">
            AI Assistant
          </a>
          <a
            href="#profile"
            className="nav-button"
          >
            Get Started →
          </a>
        </div>
      </nav>

      {/* HERO */}
      <section
        className="hero"
        id="home"
      >
        <div className="hero-content">
          <div className="hero-badge">
            ✦ AI-Powered Student Opportunities
          </div>

          <h1>
            Discover the right
            <span>
              {" "}opportunities.
            </span>
            <br />
            Build your future.
          </h1>

          <p>
            AENOVA connects students with
            real opportunities that match
            their interests, skills, goals,
            department, and learning journey
            across Tamil Nadu and India.
          </p>

          <div className="hero-buttons">
            <a
              href="#recommendations"
              className="primary-button"
            >
              Get My AI Matches →
            </a>

            <a
              href="#assistant"
              className="secondary-button"
            >
              Meet ANEBESTRA
            </a>
          </div>

          <div className="hero-note">
            ✦ All departments
            &nbsp; • &nbsp;
            Real opportunity listings
            &nbsp; • &nbsp;
            Explainable recommendations
          </div>
        </div>

        <div className="hero-visual">
          <img
            src={HeroStudent}
            alt="Student discovering opportunities"
          />
        </div>
      </section>

      {/* FEATURES */}
      <section
        className="features-section"
        id="features"
      >
        <div className="section-heading">
          <div className="section-badge">
            ✦ Built for students
          </div>

          <h2>
            Everything you need to
            <span>
              {" "}discover & grow.
            </span>
          </h2>

          <p>
            AENOVA combines real opportunity
            discovery, personalized matching,
            feedback, and AI assistance.
          </p>
        </div>

        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon blue-icon">
              ✦
            </div>
            <h3>
              AI Recommendation Engine
            </h3>
            <p>
              Your profile is compared with
              available real opportunities to
              rank relevant options.
            </p>
            <a href="#recommendations">
              See my matches →
            </a>
          </div>

          <div className="feature-card">
            <div className="feature-icon purple-icon">
              ✦
            </div>
            <h3>
              All Departments
            </h3>
            <p>
              Students from engineering,
              commerce, management, law,
              design, agriculture, arts and
              other fields can use AENOVA.
            </p>
            <a href="#profile">
              Build profile →
            </a>
          </div>

          <div className="feature-card">
            <div className="feature-icon teal-icon">
              ✦
            </div>
            <h3>
              Real Opportunities
            </h3>
            <p>
              AENOVA uses public opportunity
              listings and provides the official
              listing whenever available.
            </p>
            <a href="#opportunities">
              Explore opportunities →
            </a>
          </div>

          <div className="feature-card">
            <div className="feature-icon orange-icon">
              ✦
            </div>
            <h3>
              ANEBESTRA AI Assistant
            </h3>
            <p>
              Ask about learning, careers,
              projects, skills, opportunities,
              interviews and more.
            </p>
            <a href="#assistant">
              Talk to ANEBESTRA →
            </a>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section
        className="how-section"
        id="how-it-works"
      >
        <div className="section-heading">
          <div className="section-badge">
            ✦ How AENOVA works
          </div>

          <h2>
            From your profile to
            <span>
              {" "}your next opportunity.
            </span>
          </h2>

          <p>
            AENOVA uses your actual profile
            signals to create explainable
            recommendations.
          </p>
        </div>

        <div className="steps-container">
          <div className="step-card">
            <div className="step-number">
              01
            </div>
            <div className="step-icon">
              👤
            </div>
            <h3>
              Build Your Profile
            </h3>
            <p>
              Add your education, location,
              skills, interests and career goal.
            </p>
          </div>

          <div className="step-connector">
            →
          </div>

          <div className="step-card">
            <div className="step-number">
              02
            </div>
            <div className="step-icon">
              🧠
            </div>
            <h3>
              Understand
            </h3>
            <p>
              AENOVA identifies useful signals
              from your profile.
            </p>
          </div>

          <div className="step-connector">
            →
          </div>

          <div className="step-card">
            <div className="step-number">
              03
            </div>
            <div className="step-icon">
              🎯
            </div>
            <h3>
              Match
            </h3>
            <p>
              Real opportunities are ranked
              according to relevance.
            </p>
          </div>

          <div className="step-connector">
            →
          </div>

          <div className="step-card">
            <div className="step-number">
              04
            </div>
            <div className="step-icon">
              🔄
            </div>
            <h3>
              Learn From Feedback
            </h3>
            <p>
              Likes and dislikes become
              additional recommendation signals.
            </p>
          </div>
        </div>
      </section>

      {/* RECOMMENDATIONS */}
      <section
        className="opportunities-section"
        id="recommendations"
        style={{
          background:
            "linear-gradient(180deg,#f8f8ff,#ffffff)",
        }}
      >
        <div className="section-heading">
          <div className="section-badge">
            ✦ AI Recommendation Engine
          </div>

          <h2>
            Opportunities selected
            <span>
              {" "}for you.
            </span>
          </h2>

          <p>
            AENOVA compares your profile
            with the available real public
            listings and explains why a
            recommendation may be relevant.
          </p>
        </div>

        <div
          style={{
            maxWidth:
              "1050px",
            margin:
              "0 auto 25px",
            display:
              "grid",
            gridTemplateColumns:
              "repeat(3,1fr)",
            gap: "14px",
          }}
        >
          <div
            style={{
              background:
                "#fff",
              border:
                "1px solid #e8e8f3",
              borderRadius:
                "14px",
              padding:
                "16px",
            }}
          >
            <div
              style={{
                fontSize:
                  "11px",
                color:
                  "#7b7c91",
                fontWeight:
                  "700",
              }}
            >
              PROFILE SIGNALS
            </div>

            <strong
              style={{
                display:
                  "block",
                fontSize:
                  "22px",
                color:
                  "#5952d8",
                marginTop:
                  "4px",
              }}
            >
              {
                uniqueWords(
                  profile.skills
                ).length +
                uniqueWords(
                  profile.interests
                ).length
              }
            </strong>

            <span
              style={{
                fontSize:
                  "11px",
                color:
                  "#77788c",
              }}
            >
              skills + interests
            </span>
          </div>

          <div
            style={{
              background:
                "#fff",
              border:
                "1px solid #e8e8f3",
              borderRadius:
                "14px",
              padding:
                "16px",
            }}
          >
            <div
              style={{
                fontSize:
                  "11px",
                color:
                  "#7b7c91",
                fontWeight:
                  "700",
              }}
            >
              OPPORTUNITIES ANALYZED
            </div>

            <strong
              style={{
                display:
                  "block",
                fontSize:
                  "22px",
                color:
                  "#5952d8",
                marginTop:
                  "4px",
              }}
            >
              {opportunities.length}
            </strong>

            <span
              style={{
                fontSize:
                  "11px",
                color:
                  "#77788c",
              }}
            >
              current real listings
            </span>
          </div>

          <div
            style={{
              background:
                "#fff",
              border:
                "1px solid #e8e8f3",
              borderRadius:
                "14px",
              padding:
                "16px",
            }}
          >
            <div
              style={{
                fontSize:
                  "11px",
                color:
                  "#7b7c91",
                fontWeight:
                  "700",
              }}
            >
              FEEDBACK SIGNALS
            </div>

            <strong
              style={{
                display:
                  "block",
                fontSize:
                  "22px",
                color:
                  "#5952d8",
                marginTop:
                  "4px",
              }}
            >
              {
                Object.keys(
                  feedback
                ).length
              }
            </strong>

            <span
              style={{
                fontSize:
                  "11px",
                color:
                  "#77788c",
              }}
            >
              preferences learned
            </span>
          </div>
        </div>

        {!profile.skills &&
          !profile.interests &&
          !profile.career_goal && (
            <div
              style={{
                maxWidth:
                  "1050px",
                margin:
                  "0 auto 22px",
                background:
                  "#f2f1ff",
                border:
                  "1px solid #ddd9ff",
                borderRadius:
                  "13px",
                padding:
                  "14px 17px",
                color:
                  "#5049bd",
                fontSize:
                  "13px",
              }}
            >
              💡{" "}
              <strong>
                Complete your profile
              </strong>{" "}
              to get personalized
              recommendations.
              {" "}
              <a
                href="#profile"
                style={{
                  color:
                    "#4f47d0",
                  fontWeight:
                    "800",
                }}
              >
                Complete profile →
              </a>
            </div>
          )}

        <div
          style={{
            display:
              "flex",
            justifyContent:
              "center",
            gap: "8px",
            marginBottom:
              "22px",
            flexWrap:
              "wrap",
          }}
        >
          <button
            type="button"
            onClick={() =>
              setRecommendationMode(
                "recommended"
              )
            }
            style={{
              border:
                "none",
              borderRadius:
                "999px",
              padding:
                "9px 15px",
              cursor:
                "pointer",
              fontWeight:
                "700",
              background:
                recommendationMode ===
                "recommended"
                  ? "#5d55df"
                  : "#eeeeF8",
              color:
                recommendationMode ===
                "recommended"
                  ? "#fff"
                  : "#55566e",
            }}
          >
            ✦ Recommended
          </button>

          <button
            type="button"
            onClick={() =>
              setRecommendationMode(
                "all"
              )
            }
            style={{
              border:
                "none",
              borderRadius:
                "999px",
              padding:
                "9px 15px",
              cursor:
                "pointer",
              fontWeight:
                "700",
              background:
                recommendationMode ===
                "all"
                  ? "#5d55df"
                  : "#eeeeF8",
              color:
                recommendationMode ===
                "all"
                  ? "#fff"
                  : "#55566e",
            }}
          >
            All analyzed
          </button>
        </div>

        {loadingOpportunities ? (
          <div className="empty-opportunities">
            <h3>
              Analyzing opportunities...
            </h3>
            <p>
              AENOVA is preparing your
              personalized matches.
            </p>
          </div>
        ) : (
          <div
            style={{
              maxWidth:
                "1050px",
              margin:
                "0 auto",
              display:
                "grid",
              gridTemplateColumns:
                "repeat(auto-fit,minmax(290px,1fr))",
              gap: "18px",
            }}
          >
            {(recommendationMode ===
            "recommended"
              ? topRecommendations
              : recommendations.slice(
                  0,
                  9
                )
            ).map(
              (item, index) => (
                <RecommendationCard
                  key={
                    item.opportunity.id ||
                    item.opportunity.title ||
                    index
                  }
                  item={item}
                  featured={
                    index === 0
                  }
                />
              )
            )}
          </div>
        )}

        {!loadingOpportunities &&
          topRecommendations.length ===
            0 && (
            <div
              style={{
                maxWidth:
                  "700px",
                margin:
                  "22px auto 0",
                textAlign:
                  "center",
                padding:
                  "35px 20px",
                background:
                  "#fff",
                borderRadius:
                  "18px",
                border:
                  "1px solid #e8e8f3",
              }}
            >
              <h3>
                Build your profile for better matches
              </h3>

              <p
                style={{
                  color:
                    "#77788c",
                }}
              >
                Add your department,
                skills, interests and
                career goal. AENOVA will
                use those signals to rank
                real opportunities.
              </p>

              <a
                href="#profile"
                className="primary-button"
                style={{
                  display:
                    "inline-block",
                  textDecoration:
                    "none",
                }}
              >
                Complete My Profile →
              </a>
            </div>
          )}
      </section>

      {/* ALL OPPORTUNITIES */}
      <section
        className="opportunities-section"
        id="opportunities"
      >
        <div className="section-heading">
          <div className="section-badge">
            ✦ Explore opportunities
          </div>

          <h2>
            Browse the
            <span>
              {" "}available listings.
            </span>
          </h2>

          <p>
            Real public opportunity
            listings currently collected
            by AENOVA.
          </p>
        </div>

        <div className="opportunity-tabs">
          {[
            "All",
            "Hackathon",
            "Internship",
            "Workshop",
            "Competition",
          ].map(
            (category) => (
              <button
                key={category}
                type="button"
                className={
                  selectedCategory ===
                  category
                    ? "active-tab"
                    : ""
                }
                onClick={() =>
                  setSelectedCategory(
                    category
                  )
                }
              >
                {category ===
                "All"
                  ? "All"
                  : category ===
                    "Hackathon"
                  ? "Hackathons"
                  : category ===
                    "Internship"
                  ? "Internships"
                  : category ===
                    "Workshop"
                  ? "Workshops"
                  : "Competitions"}
              </button>
            )
          )}
        </div>

        <div className="opportunities-grid">
          {loadingOpportunities ? (
            <div className="empty-opportunities">
              <h3>
                Finding current opportunities...
              </h3>
              <p>
                AENOVA is loading public
                opportunity listings.
              </p>
            </div>
          ) : filteredOpportunities.length ===
            0 ? (
            <div className="empty-opportunities">
              <h3>
                No opportunities found
              </h3>
              <p>
                There are currently no
                listings available for
                this category.
              </p>
            </div>
          ) : (
            filteredOpportunities.map(
              (
                opportunity,
                index
              ) => (
                <div
                  className="opportunity-card"
                  key={
                    opportunity.id ||
                    `${opportunity.title}-${index}`
                  }
                >
                  <div className="opportunity-top">
                    <span className="opportunity-type blue-type">
                      {opportunity.category ||
                        "Opportunity"}
                    </span>

                    <span
                      className="demo-label"
                      style={{
                        background:
                          "#e8f8f3",
                        color:
                          "#16816f",
                      }}
                    >
                      LIVE ·{" "}
                      {opportunity.source ||
                        "PUBLIC"}
                    </span>
                  </div>

                  <h3>
                    {opportunity.title ||
                      "Opportunity"}
                  </h3>

                  <p>
                    {opportunity.description ||
                      "See the official listing for complete details."}
                  </p>

                  <div className="opportunity-details">
                    <span>
                      📍{" "}
                      {opportunity.location ||
                        "See official listing"}
                    </span>

                    <span>
                      🏢{" "}
                      {opportunity.organization ||
                        "See official listing"}
                    </span>

                    {opportunity.deadline && (
                      <span>
                        📅 Registration:{" "}
                        {opportunity.deadline}
                      </span>
                    )}

                    {opportunity.event_date && (
                      <span>
                        🗓 Event:{" "}
                        {opportunity.event_date}
                      </span>
                    )}
                  </div>

                  {opportunity.url ? (
                    <a
                      href={
                        opportunity.url
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="view-button"
                      style={{
                        display:
                          "block",
                        textAlign:
                          "center",
                        textDecoration:
                          "none",
                      }}
                    >
                      View Official Listing →
                    </a>
                  ) : (
                    <button
                      type="button"
                      className="view-button"
                      disabled
                    >
                      Official listing unavailable
                    </button>
                  )}
                </div>
              )
            )
          )}
        </div>
      </section>

      {/* STUDENT PROFILE */}
      <section
        className="profile-section"
        id="profile"
      >
        <div className="section-heading">
          <span className="section-badge">
            ✦ Student Profile
          </span>

          <h2>
            Tell AENOVA about
            <span>
              {" "}you.
            </span>
          </h2>

          <p>
            Complete your profile step by
            step. Your information helps
            AENOVA find relevant real
            opportunities for your field.
          </p>
        </div>

        <div
          className="profile-form"
          style={{
            maxWidth:
              "620px",
            margin:
              "0 auto",
          }}
        >
          {/* PROGRESS */}
          <div
            style={{
              display:
                "flex",
              alignItems:
                "center",
              justifyContent:
                "center",
              gap: "6px",
              marginBottom:
                "24px",
              flexWrap:
                "wrap",
            }}
          >
            {[1, 2, 3, 4, 5].map(
              (step) => (
                <div
                  key={step}
                  style={{
                    display:
                      "flex",
                    alignItems:
                      "center",
                    gap: "6px",
                  }}
                >
                  <div
                    style={{
                      width:
                        "32px",
                      height:
                        "32px",
                      borderRadius:
                        "50%",
                      display:
                        "grid",
                      placeItems:
                        "center",
                      background:
                        profileStep >=
                        step
                          ? "#6257e8"
                          : "#eeeeF8",
                      color:
                        profileStep >=
                        step
                          ? "#fff"
                          : "#77788c",
                      fontSize:
                        "11px",
                      fontWeight:
                        "800",
                    }}
                  >
                    {step}
                  </div>

                  {step < 5 && (
                    <div
                      style={{
                        width:
                          "35px",
                        height:
                          "2px",
                        background:
                          profileStep >
                          step
                            ? "#6257e8"
                            : "#e4e4ef",
                      }}
                    />
                  )}
                </div>
              )
            )}
          </div>

          {/* STEP 1 */}
          {profileStep === 1 && (
            <div>
              <div
                style={{
                  textAlign:
                    "center",
                  marginBottom:
                    "18px",
                }}
              >
                <h3
                  style={{
                    margin:
                      "0 0 6px",
                    color:
                      "#181b38",
                  }}
                >
                  Basic information
                </h3>

                <p
                  style={{
                    margin: 0,
                    color:
                      "#77788c",
                    fontSize:
                      "13px",
                  }}
                >
                  Let's start with your
                  basic details.
                </p>
              </div>

              <input
                type="text"
                placeholder="Full name"
                value={
                  profile.full_name
                }
                onChange={(event) =>
                  updateProfile(
                    "full_name",
                    event.target.value
                  )
                }
              />

              <input
                type="email"
                placeholder="Email address"
                value={
                  profile.email
                }
                onChange={(event) =>
                  updateProfile(
                    "email",
                    event.target.value
                  )
                }
              />

              <button
                type="button"
                onClick={() => {
                  if (
                    !profile.full_name.trim()
                  ) {
                    setProfileMessage(
                      "Please enter your full name."
                    );
                    return;
                  }

                  if (
                    !profile.email.trim()
                  ) {
                    setProfileMessage(
                      "Please enter your email address."
                    );
                    return;
                  }

                  setProfileMessage("");
                  setProfileStep(2);
                }}
              >
                Next →
              </button>
            </div>
          )}

          {/* STEP 2 */}
          {profileStep === 2 && (
            <div>
              <div
                style={{
                  textAlign:
                    "center",
                  marginBottom:
                    "18px",
                }}
              >
                <h3
                  style={{
                    margin:
                      "0 0 6px",
                    color:
                      "#181b38",
                  }}
                >
                  Your education
                </h3>

                <p
                  style={{
                    margin: 0,
                    color:
                      "#77788c",
                    fontSize:
                      "13px",
                  }}
                >
                  Tell AENOVA about your
                  academic background.
                </p>
              </div>

              <input
                type="text"
                placeholder="College name"
                value={
                  profile.college
                }
                onChange={(event) =>
                  updateProfile(
                    "college",
                    event.target.value
                  )
                }
              />

              <input
                type="text"
                placeholder="Department (CSE, ECE, Mechanical, Commerce, Civil, etc.)"
                value={
                  profile.department
                }
                onChange={(event) =>
                  updateProfile(
                    "department",
                    event.target.value
                  )
                }
              />

              <input
                type="text"
                placeholder="Study year (1st Year, 2nd Year, Final Year, etc.)"
                value={
                  profile.study_year
                }
                onChange={(event) =>
                  updateProfile(
                    "study_year",
                    event.target.value
                  )
                }
              />

              <div
                style={{
                  display:
                    "flex",
                  gap:
                    "10px",
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setProfileMessage("");
                    setProfileStep(1);
                  }}
                  style={{
                    background:
                      "#eeeeF8",
                    color:
                      "#55566e",
                  }}
                >
                  ← Back
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (
                      !profile.college.trim()
                    ) {
                      setProfileMessage(
                        "Please enter your college name."
                      );
                      return;
                    }

                    if (
                      !profile.department.trim()
                    ) {
                      setProfileMessage(
                        "Please enter your department."
                      );
                      return;
                    }

                    setProfileMessage("");
                    setProfileStep(3);
                  }}
                >
                  Next →
                </button>
              </div>
            </div>
          )}

          {/* STEP 3 */}
          {profileStep === 3 && (
            <div>
              <div
                style={{
                  textAlign:
                    "center",
                  marginBottom:
                    "18px",
                }}
              >
                <h3
                  style={{
                    margin:
                      "0 0 6px",
                    color:
                      "#181b38",
                  }}
                >
                  Where are you based?
                </h3>

                <p
                  style={{
                    margin: 0,
                    color:
                      "#77788c",
                    fontSize:
                      "13px",
                  }}
                >
                  Location helps AENOVA
                  understand nearby
                  opportunities while still
                  showing opportunities
                  across India.
                </p>
              </div>

              <input
                type="text"
                placeholder="City / Location (e.g. Coimbatore, Chennai, Madurai)"
                value={
                  profile.location
                }
                onChange={(event) =>
                  updateProfile(
                    "location",
                    event.target.value
                  )
                }
              />

              <div
                style={{
                  background:
                    "#f6f5ff",
                  borderRadius:
                    "12px",
                  padding:
                    "12px",
                  marginBottom:
                    "14px",
                  color:
                    "#55566e",
                  fontSize:
                    "12px",
                  lineHeight:
                    "1.5",
                }}
              >
                🌎 AENOVA can recommend
                opportunities from
                <strong>
                  {" "}Tamil Nadu
                </strong>
                , other parts of
                <strong>
                  {" "}India
                </strong>
                , and eligible
                online/remote listings.
              </div>

              <div
                style={{
                  display:
                    "flex",
                  gap:
                    "10px",
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setProfileMessage("");
                    setProfileStep(2);
                  }}
                  style={{
                    background:
                      "#eeeeF8",
                    color:
                      "#55566e",
                  }}
                >
                  ← Back
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setProfileMessage("");
                    setProfileStep(4);
                  }}
                >
                  Next →
                </button>
              </div>
            </div>
          )}

          {/* STEP 4 */}
          {profileStep === 4 && (
            <div>
              <div
                style={{
                  textAlign:
                    "center",
                  marginBottom:
                    "18px",
                }}
              >
                <h3
                  style={{
                    margin:
                      "0 0 6px",
                    color:
                      "#181b38",
                  }}
                >
                  Your skills & interests
                </h3>

                <p
                  style={{
                    margin: 0,
                    color:
                      "#77788c",
                    fontSize:
                      "13px",
                  }}
                >
                  These are important for
                  personalized matching.
                </p>
              </div>

              <input
                type="text"
                placeholder="Skills (Python, AutoCAD, Excel, Marketing, Java, etc.)"
                value={
                  profile.skills
                }
                onChange={(event) =>
                  updateProfile(
                    "skills",
                    event.target.value
                  )
                }
              />

              <input
                type="text"
                placeholder="Interests (AI, Finance, Design, Robotics, Law, Agriculture, etc.)"
                value={
                  profile.interests
                }
                onChange={(event) =>
                  updateProfile(
                    "interests",
                    event.target.value
                  )
                }
              />

              <div
                style={{
                  display:
                    "flex",
                  gap:
                    "10px",
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setProfileMessage("");
                    setProfileStep(3);
                  }}
                  style={{
                    background:
                      "#eeeeF8",
                    color:
                      "#55566e",
                  }}
                >
                  ← Back
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (
                      !profile.skills.trim()
                    ) {
                      setProfileMessage(
                        "Please add at least one skill."
                      );
                      return;
                    }

                    if (
                      !profile.interests.trim()
                    ) {
                      setProfileMessage(
                        "Please add your interests."
                      );
                      return;
                    }

                    setProfileMessage("");
                    setProfileStep(5);
                  }}
                >
                  Next →
                </button>
              </div>
            </div>
          )}

          {/* STEP 5 */}
          {profileStep === 5 && (
            <div>
              <div
                style={{
                  textAlign:
                    "center",
                  marginBottom:
                    "18px",
                }}
              >
                <h3
                  style={{
                    margin:
                      "0 0 6px",
                    color:
                      "#181b38",
                  }}
                >
                  Your career direction
                </h3>

                <p
                  style={{
                    margin: 0,
                    color:
                      "#77788c",
                    fontSize:
                      "13px",
                  }}
                >
                  Tell AENOVA what you
                  want to work towards.
                </p>
              </div>

              <input
                type="text"
                placeholder="Career goal (AI Engineer, Finance Analyst, Civil Engineer, Lawyer, Designer, etc.)"
                value={
                  profile.career_goal
                }
                onChange={(event) =>
                  updateProfile(
                    "career_goal",
                    event.target.value
                  )
                }
              />

              <div
                style={{
                  background:
                    "linear-gradient(135deg,#f3f1ff,#f5fbff)",
                  border:
                    "1px solid #e4e1ff",
                  borderRadius:
                    "13px",
                  padding:
                    "14px",
                  marginBottom:
                    "15px",
                  fontSize:
                    "12px",
                  color:
                    "#55566e",
                  lineHeight:
                    "1.55",
                }}
              >
                🎯 AENOVA uses your complete
                profile to rank relevant
                <strong>
                  {" "}real opportunities
                </strong>
                . All academic fields are
                supported.
              </div>

              <div
                style={{
                  display:
                    "flex",
                  gap:
                    "10px",
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setProfileMessage("");
                    setProfileStep(4);
                  }}
                  style={{
                    background:
                      "#eeeeF8",
                    color:
                      "#55566e",
                  }}
                >
                  ← Back
                </button>

                <button
                  type="button"
                  onClick={
                    saveProfile
                  }
                  disabled={
                    savingProfile
                  }
                >
                  {savingProfile
                    ? "Saving..."
                    : "Save My Profile ✓"}
                </button>
              </div>
            </div>
          )}

          {profileMessage && (
            <div className="profile-message">
              {profileMessage}
            </div>
          )}
        </div>
      </section>

      {/* ANEBESTRA */}
      <section
        className="assistant-section"
        id="assistant"
      >
        <div className="assistant-content">
          <div className="section-badge">
            ✦ Meet ANEBESTRA
          </div>

          <h2>
            Your AI assistant for
            <span>
              {" "}student life.
            </span>
          </h2>

          <p>
            Ask ANEBESTRA about learning,
            programming, careers, projects,
            opportunities, interviews, skills,
            or your next step.
          </p>

          <button
            type="button"
            className="primary-button"
            onClick={() =>
              document
                .getElementById(
                  "assistant-chat"
                )
                ?.focus()
            }
          >
            Talk to ANEBESTRA →
          </button>
        </div>

        <div className="assistant-card">
          <div className="assistant-header">
            <div className="assistant-avatar">
              ✦
            </div>

            <div>
              <h3>
                ANEBESTRA
              </h3>

              <span>
                AI Student Assistant
              </span>
            </div>
          </div>

          <div
            style={{
              display:
                "flex",
              justifyContent:
                "flex-end",
              marginTop:
                "10px",
              marginBottom:
                "4px",
            }}
          >
            <button
              type="button"
              onClick={
                startNewChat
              }
              style={{
                border:
                  "none",
                background:
                  "transparent",
                color:
                  "#6558e8",
                fontSize:
                  "12px",
                fontWeight:
                  "700",
                cursor:
                  "pointer",
              }}
            >
              + New chat
            </button>
          </div>

          <div className="chat-messages">
            {messages.map(
              (message) => (
                <div
                  key={
                    message.id
                  }
                  className={
                    message.sender ===
                    "bot"
                      ? "chat-message bot-message"
                      : "chat-message user-message"
                  }
                  style={
                    message.sender ===
                    "user"
                      ? {
                          background:
                            "linear-gradient(135deg,#4d6df5,#7651ed)",
                          color:
                            "#ffffff",
                          marginLeft:
                            "64px",
                          marginRight:
                            "0",
                          borderRadius:
                            "16px 16px 5px 16px",
                          padding:
                            "12px 16px",
                          textAlign:
                            "left",
                          fontWeight:
                            "600",
                          boxShadow:
                            "0 6px 18px rgba(80,80,220,0.15)",
                          wordBreak:
                            "break-word",
                        }
                      : undefined
                  }
                >
                  {message.isThinking ? (
                    <div
                      style={{
                        display:
                          "flex",
                        gap:
                          "8px",
                        alignItems:
                          "center",
                      }}
                    >
                      <span>
                        ANEBESTRA is thinking
                      </span>
                      <span>
                        •••
                      </span>
                    </div>
                  ) : message.sender ===
                    "bot" ? (
                    <div
                      style={{
                        lineHeight:
                          "1.6",
                        textAlign:
                          "left",
                        width:
                          "100%",
                        wordBreak:
                          "break-word",
                      }}
                    >
                      {renderAIText(
                        message.text
                      )}
                    </div>
                  ) : (
                    <div
                      style={{
                        lineHeight:
                          "1.5",
                        whiteSpace:
                          "pre-wrap",
                        wordBreak:
                          "break-word",
                      }}
                    >
                      {message.text}
                    </div>
                  )}
                </div>
              )
            )}
          </div>

          <div className="chat-input">
            <input
              id="assistant-chat"
              type="text"
              value={
                chatMessage
              }
              placeholder="Ask ANEBESTRA something..."
              onChange={(event) =>
                setChatMessage(
                  event.target.value
                )
              }
              onKeyDown={
                handleChatKeyDown
              }
              disabled={
                sendingMessage
              }
              autoComplete="off"
            />

            <button
              type="button"
              onClick={
                sendMessage
              }
              disabled={
                sendingMessage ||
                !chatMessage.trim()
              }
            >
              {sendingMessage
                ? "..."
                : "→"}
            </button>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section
        style={{
          padding:
            "75px 20px",
          background:
            "linear-gradient(135deg,#edf0ff,#f7f3ff)",
          textAlign:
            "center",
        }}
      >
        <div
          style={{
            maxWidth:
              "750px",
            margin:
              "0 auto",
          }}
        >
          <div className="section-badge">
            ✦ Your next step starts here
          </div>

          <h2
            style={{
              fontSize:
                "clamp(30px,5vw,48px)",
              color:
                "#171934",
              margin:
                "12px 0",
            }}
          >
            Discover.
            <span
              style={{
                color:
                  "#6257e8",
              }}
            >
              {" "}Learn.
            </span>
            {" "}Grow.
          </h2>

          <p
            style={{
              color:
                "#66687d",
              lineHeight:
                "1.7",
              maxWidth:
                "600px",
              margin:
                "0 auto 25px",
            }}
          >
            Build your profile, explore
            real opportunities, get
            personalized recommendations,
            and talk to ANEBESTRA whenever
            you need guidance.
          </p>

          <a
            href="#recommendations"
            className="primary-button"
            style={{
              display:
                "inline-block",
              textDecoration:
                "none",
            }}
          >
            See My Recommendations →
          </a>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="footer">
        <div className="footer-logo">
          <img
            src={AENOVALogo}
            alt="AENOVA"
            className="aenova-logo"
          />
        </div>

        <p>
          Discover · Learn · Grow
        </p>

        <span>
          AENOVA — AI-powered opportunity
          discovery for students.
        </span>
      </footer>
    </div>
  );
}

export default App;
