import { useEffect, useMemo, useState } from "react";
import "./App.css";

import AENOVALogo from "./assets/AENOVA-logo.png";
import HeroStudent from "./assets/HeroStudent.png";

const API = "https://aenova.onrender.com";

const EMPTY_PROFILE = {
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
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);
}

function uniqueWords(value) {
  return [...new Set(tokenize(value))];
}

/* =========================================================
   LOCAL RECOMMENDATION FALLBACK
========================================================= */

function calculateRecommendation(
  opportunity,
  profile,
  feedback
) {
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

  const matchedSkills = skills.filter((word) =>
    opportunityText.includes(word)
  );

  const matchedInterests = interests.filter((word) =>
    opportunityText.includes(word)
  );

  const matchedCareer = career.filter((word) =>
    opportunityText.includes(word)
  );

  const matchedDepartment = department.filter((word) =>
    opportunityText.includes(word)
  );

  const matchedLocation = location.filter((word) =>
    opportunityText.includes(word)
  );

  let score = 20;

  score += Math.min(matchedSkills.length * 12, 36);
  score += Math.min(matchedInterests.length * 9, 27);
  score += Math.min(matchedCareer.length * 8, 16);
  score += Math.min(matchedDepartment.length * 10, 20);
  score += Math.min(matchedLocation.length * 5, 10);

  const key = String(
    opportunity.id || opportunity.title || ""
  );

  if (feedback[key] === "like") {
    score += 12;
  }

  if (feedback[key] === "dislike") {
    score -= 20;
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

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
    reasons.push("connects with your career goal");
  }

  if (matchedDepartment.length) {
    reasons.push("is relevant to your department");
  }

  if (matchedLocation.length) {
    reasons.push("has a location connection");
  }

  if (!reasons.length) {
    reasons.push("may help you explore a new area");
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
  };
}

/* =========================================================
   MARKDOWN / URL FORMATTER
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
        ending = cleanUrl.slice(-1) + ending;
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

    if (part.startsWith("**") && part.endsWith("**")) {
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

    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={index}
          style={{
            background: "rgba(99,88,232,0.10)",
            padding: "2px 5px",
            borderRadius: "4px",
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
  const elements = [];

  let insideCode = false;
  let codeLanguage = "";
  let codeLines = [];

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
            whiteSpace: "pre-wrap",
          }}
        >
          <code>{codeLines.join("\n")}</code>
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
        codeLanguage = trimmed.replace(/^```/, "").trim();
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
          {formatInlineText(trimmed.slice(2))}
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

    if (trimmed === "---" || trimmed === "***") {
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
            {formatInlineText(trimmed.slice(2))}
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
            {formatInlineText(numbered[2])}
          </span>
        </div>
      );
      return;
    }

    elements.push(
      <div
        key={index}
        style={{
          marginBottom: "7px",
        }}
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
   APP
========================================================= */

function App() {
  /* =======================================================
     PROFILE
  ======================================================= */

  const [profile, setProfile] = useState(() => {
    try {
      const saved = localStorage.getItem(
        "aenova_profile"
      );

      return saved
        ? {
            ...EMPTY_PROFILE,
            ...JSON.parse(saved),
          }
        : EMPTY_PROFILE;
    } catch {
      return EMPTY_PROFILE;
    }
  });

  const [profileId, setProfileId] = useState(() => {
    const saved = localStorage.getItem(
      "aenova_profile_id"
    );

    return saved ? Number(saved) : null;
  });

  const [profileStep, setProfileStep] = useState(1);

  const [profileMessage, setProfileMessage] =
    useState("");

  const [savingProfile, setSavingProfile] =
    useState(false);

  const [profileSaved, setProfileSaved] = useState(
    () =>
      localStorage.getItem(
        "aenova_profile_saved"
      ) === "true"
  );

  /* =======================================================
     OPPORTUNITIES
  ======================================================= */

  const [opportunities, setOpportunities] =
    useState([]);

  const [loadingOpportunities, setLoadingOpportunities] =
    useState(true);

  const [selectedCategory, setSelectedCategory] =
    useState("All");

  /* =======================================================
     RECOMMENDATIONS
  ======================================================= */

  const [
    serverRecommendations,
    setServerRecommendations,
  ] = useState([]);

  const [
    loadingRecommendations,
    setLoadingRecommendations,
  ] = useState(false);

  const [
    recommendationMessage,
    setRecommendationMessage,
  ] = useState("");

  /* =======================================================
     FEEDBACK
  ======================================================= */

  const [feedback, setFeedback] = useState(() => {
    try {
      const saved = localStorage.getItem(
        "aenova_feedback"
      );

      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  /* =======================================================
     CHAT
  ======================================================= */

  const [messages, setMessages] = useState([
    {
      id: "welcome",
      sender: "bot",
      text:
        "Hey! 👋 I'm ANEBESTRA, your AI assistant inside AENOVA. What are you working on today?",
    },
  ]);

  const [chatMessage, setChatMessage] =
    useState("");

  const [sendingMessage, setSendingMessage] =
    useState(false);

  const [sessionId, setSessionId] = useState(() => {
    const saved = localStorage.getItem(
      "aenova_anebestra_session"
    );

    if (saved) return saved;

    const newSession =
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
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
     PERSIST PROFILE
  ======================================================= */

  useEffect(() => {
    localStorage.setItem(
      "aenova_profile",
      JSON.stringify(profile)
    );
  }, [profile]);

  useEffect(() => {
    localStorage.setItem(
      "aenova_feedback",
      JSON.stringify(feedback)
    );
  }, [feedback]);

  /* =======================================================
     LOAD OPPORTUNITIES
  ======================================================= */

  useEffect(() => {
    setLoadingOpportunities(true);

    fetch(`${API}/api/opportunities`)
      .then((response) => response.json())
      .then((data) => {
        if (
          data &&
          Array.isArray(data.opportunities)
        ) {
          setOpportunities(data.opportunities);
        } else if (Array.isArray(data)) {
          setOpportunities(data);
        } else {
          setOpportunities([]);
        }
      })
      .catch((error) => {
        console.error(
          "Opportunity loading error:",
          error
        );
        setOpportunities([]);
      })
      .finally(() => {
        setLoadingOpportunities(false);
      });
  }, []);

  /* =======================================================
     LOAD RECOMMENDATIONS
  ======================================================= */

  const loadRecommendations = async (id) => {
    if (!id) {
      setServerRecommendations([]);
      return false;
    }

    setLoadingRecommendations(true);
    setRecommendationMessage("✨ Finding your best matches...");

    try {
      const response = await fetch(
        `${API}/api/recommendations/fast/${id}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
        }
      );

      const data = await response.json();

      if (!response.ok || data?.success === false) {
        throw new Error(
          data?.message || "Unable to load recommendations."
        );
      }

      const rows = Array.isArray(data?.recommendations)
        ? data.recommendations
        : [];

      setServerRecommendations(rows);

      if (rows.length > 0) {
        const strongCount = rows.filter(
          (row) => Number(row.match_score ?? row.score ?? 0) >= 35
        ).length;

        setRecommendationMessage(
          strongCount > 0
            ? ""
            : "These are the closest available opportunities right now. Stronger matches will appear when more relevant opportunities are available."
        );

        setLoadingRecommendations(false);
        return true;
      }

      setRecommendationMessage(
        "No opportunities are available right now. New opportunities will appear as they are added."
      );
      setLoadingRecommendations(false);
      return false;

    } catch (error) {
      console.error("Recommendation loading error:", error);
      setServerRecommendations([]);
      setRecommendationMessage(
        "Your profile is saved, but recommendations could not be loaded right now."
      );
      setLoadingRecommendations(false);
      return false;
    }
  };


  const localRecommendations = useMemo(() => {
    return opportunities
      .map((opportunity) => ({
        opportunity,
        analysis: calculateRecommendation(
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

  /* =======================================================
     SERVER RECOMMENDATIONS NORMALIZATION
  ======================================================= */

  const normalizedServerRecommendations =
    useMemo(() => {
      return serverRecommendations
        .map((row) => {
          const opportunity =
            row.opportunity ||
            row.opportunities ||
            row;

          const opportunityId =
            row.opportunity_id ||
            opportunity?.id;

          const matchingOpportunity =
            opportunities.find(
              (item) =>
                String(item.id) ===
                String(opportunityId)
            );

          const finalOpportunity =
            matchingOpportunity ||
            opportunity;

          const score =
            Number(
              row.match_score ??
                row.score ??
                finalOpportunity?.match_score ??
                0
            ) || 0;

          const reason =
            row.match_reasons ||
            row.recommendation_reason ||
            row.reason ||
            "";

          return {
            opportunity:
              finalOpportunity,

            analysis: {
              score,

              level:
                score >= 75
                  ? "Strong match"
                  : score >= 55
                  ? "Good match"
                  : score >= 35
                  ? "Potential match"
                  : "Possible match",

              reasons: reason
                ? String(reason)
                    .split(/\n|;/)
                    .map((item) =>
                      item.trim()
                    )
                    .filter(Boolean)
                    .slice(0, 4)
                : [
                    "Matched using your profile",
                  ],
            },
          };
        })
        .filter(
          (item) =>
            item.opportunity &&
            (
              item.opportunity.title ||
              item.opportunity.id
            )
        )
        .sort(
          (a, b) =>
            b.analysis.score -
            a.analysis.score
        );
    }, [
      serverRecommendations,
      opportunities,
    ]);

  /* =======================================================
     FINAL RECOMMENDATIONS
  ======================================================= */

  const recommendations =
    normalizedServerRecommendations.length >
    0
      ? normalizedServerRecommendations
      : localRecommendations;

  const topRecommendations =
    recommendations
      .slice(0, 6);

  /* =======================================================
     FILTER OPPORTUNITIES
  ======================================================= */

  const filteredOpportunities =
    selectedCategory === "All"
      ? opportunities
      : opportunities.filter(
          (opportunity) =>
            String(
              opportunity.category || ""
            ).toLowerCase() ===
            selectedCategory.toLowerCase()
        );

  /* =======================================================
     UPDATE PROFILE
  ======================================================= */

  const updateProfile = (
    field,
    value
  ) => {
    setProfile((previous) => ({
      ...previous,
      [field]: value,
    }));

    setProfileMessage("");
  };

  /* =======================================================
     SCROLL
  ======================================================= */

  const scrollToSection = (id) => {
    setTimeout(() => {
      document
        .getElementById(id)
        ?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
    }, 100);
  };

  /* =======================================================
     NEXT PROFILE STEP
  ======================================================= */

  const goToNextStep = () => {
    setProfileMessage("");

    if (profileStep === 1) {
      if (!profile.full_name.trim()) {
        setProfileMessage(
          "Please enter your full name."
        );
        return;
      }

      if (!profile.email.trim()) {
        setProfileMessage(
          "Please enter your email address."
        );
        return;
      }

      setProfileStep(2);
      return;
    }

    if (profileStep === 2) {
      if (!profile.college.trim()) {
        setProfileMessage(
          "Please enter your college name."
        );
        return;
      }

      if (!profile.department.trim()) {
        setProfileMessage(
          "Please enter your department."
        );
        return;
      }

      if (!profile.study_year.trim()) {
        setProfileMessage(
          "Please enter your study year."
        );
        return;
      }

      setProfileStep(3);
      return;
    }

    if (profileStep === 3) {
      if (!profile.location.trim()) {
        setProfileMessage(
          "Please enter your city or location."
        );
        return;
      }

      setProfileStep(4);
      return;
    }

    if (profileStep === 4) {
      if (!profile.skills.trim()) {
        setProfileMessage(
          "Please add at least one skill."
        );
        return;
      }

      if (!profile.interests.trim()) {
        setProfileMessage(
          "Please add your interests."
        );
        return;
      }

      setProfileStep(5);
    }
  };

  /* =======================================================
     SAVE PROFILE
  ======================================================= */

  const saveProfile = async () => {
    setProfileMessage("");
    setRecommendationMessage("");

    if (!profile.full_name.trim()) {
      setProfileStep(1);
      setProfileMessage(
        "Please enter your full name."
      );
      return;
    }

    if (!profile.email.trim()) {
      setProfileStep(1);
      setProfileMessage(
        "Please enter your email address."
      );
      return;
    }

    if (!profile.college.trim()) {
      setProfileStep(2);
      setProfileMessage(
        "Please enter your college name."
      );
      return;
    }

    if (!profile.department.trim()) {
      setProfileStep(2);
      setProfileMessage(
        "Please enter your department."
      );
      return;
    }

    if (!profile.study_year.trim()) {
      setProfileStep(2);
      setProfileMessage(
        "Please enter your study year."
      );
      return;
    }

    if (!profile.location.trim()) {
      setProfileStep(3);
      setProfileMessage(
        "Please enter your city or location."
      );
      return;
    }

    if (!profile.skills.trim()) {
      setProfileStep(4);
      setProfileMessage(
        "Please add at least one skill."
      );
      return;
    }

    if (!profile.interests.trim()) {
      setProfileStep(4);
      setProfileMessage(
        "Please add your interests."
      );
      return;
    }

    if (!profile.career_goal.trim()) {
      setProfileStep(5);
      setProfileMessage(
        "Please enter your career goal."
      );
      return;
    }

    setSavingProfile(true);

    try {
      const response = await fetch(
        `${API}/api/profile`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify(profile),
        }
      );

      const data = await response.json();

      if (
        !response.ok ||
        data.success === false
      ) {
        throw new Error(
          data.message ||
            data.detail ||
            "Profile could not be saved."
        );
      }

      let returnedProfileId =
        data.profile_id ||
        data.id ||
        null;

      if (
        !returnedProfileId &&
        data.data &&
        data.data.id
      ) {
        returnedProfileId =
          data.data.id;
      }

      if (!returnedProfileId) {
        throw new Error(
          "The backend did not return a profile ID."
        );
      }

      const numericProfileId =
        Number(returnedProfileId);

      setProfileId(
        numericProfileId
      );

      localStorage.setItem(
        "aenova_profile_id",
        String(numericProfileId)
      );

      localStorage.setItem(
        "aenova_profile_saved",
        "true"
      );

      localStorage.setItem(
        "aenova_profile",
        JSON.stringify(profile)
      );

      setProfileSaved(true);

      setProfileMessage(
        "✓ Profile saved successfully! Creating your personalized recommendations..."
      );

      await loadRecommendations(
        numericProfileId
      );

      setProfileMessage(
        "✓ Profile saved successfully! Your personalized recommendations are ready."
      );

      scrollToSection(
        "recommendations"
      );
    } catch (error) {
      console.error(
        "Profile save error:",
        error
      );

      setProfileMessage(
        error.message ||
          "Unable to save your profile."
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

    fetch(`${API}/api/feedback`, {
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
    }).catch((error) => {
      console.error(
        "Feedback error:",
        error
      );
    });
  };

  /* =======================================================
     NEW CHAT
  ======================================================= */

  const startNewChat = () => {
    const newSession =
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
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

  /* =======================================================
     CHAT HISTORY
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
          Array.isArray(data.messages) &&
          data.messages.length > 0
        ) {
          setMessages(
            data.messages.map(
              (item, index) => ({
                id:
                  `history-${
                    item.id ||
                    index
                  }`,
                sender:
                  item.role ===
                  "assistant"
                    ? "bot"
                    : "user",
                text:
                  item.message ||
                  "",
              })
            )
          );
        }

        if (data?.profile_id) {
          const id =
            Number(
              data.profile_id
            );

          setProfileId(id);

          localStorage.setItem(
            "aenova_profile_id",
            String(id)
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
     SEND CHAT
  ======================================================= */

  const sendMessage = async () => {
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
            body:
              JSON.stringify({
                message,
                session_id:
                  sessionId,
                profile_id:
                  profileId,
                profile,
              }),
          }
        );

      const data =
        await response.json();

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.reply ||
            data.message ||
            data.detail ||
            "ANEBESTRA could not respond."
        );
      }

      if (data.profile_id) {
        const id =
          Number(
            data.profile_id
          );

        setProfileId(id);

        localStorage.setItem(
          "aenova_profile_id",
          String(id)
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
                      error.message ||
                      "I couldn't connect to the AENOVA AI service.",
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
    ({ item }) => {
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
          style={{
            background:
              "#ffffff",
            border:
              "1px solid #e6e5f2",
            borderRadius:
              "18px",
            padding:
              "20px",
            boxShadow:
              "0 10px 30px rgba(40,40,100,0.07)",
            height:
              "100%",
            boxSizing:
              "border-box",
          }}
        >
          <div
            style={{
              display:
                "flex",
              justifyContent:
                "space-between",
              alignItems:
                "center",
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
                    : "#f0efff",
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

            <strong
              style={{
                color:
                  "#5e55df",
                fontSize:
                  "20px",
              }}
            >
              {analysis.score}%
            </strong>
          </div>

          <div
            style={{
              fontSize:
                "11px",
              color:
                "#777",
              fontWeight:
                "800",
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
                  (
                    reason,
                    index
                  ) => (
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
              gap:
                "5px",
              marginBottom:
                "14px",
              fontSize:
                "11px",
              color:
                "#77788c",
            }}
          >
            {opportunity.organization && (
              <span>
                🏢{" "}
                {
                  opportunity.organization
                }
              </span>
            )}

            {opportunity.location && (
              <span>
                📍{" "}
                {
                  opportunity.location
                }
              </span>
            )}

            {opportunity.deadline && (
              <span>
                📅 Registration:{" "}
                {
                  opportunity.deadline
                }
              </span>
            )}

            {opportunity.event_date && (
              <span>
                🗓 Event:{" "}
                {
                  opportunity.event_date
                }
              </span>
            )}
          </div>

          <div
            style={{
              display:
                "flex",
              justifyContent:
                "space-between",
              alignItems:
                "center",
              marginBottom:
                "11px",
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
              Useful recommendation?
            </span>

            <div
              style={{
                display:
                  "flex",
                gap:
                  "6px",
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
                width:
                  "100%",
                boxSizing:
                  "border-box",
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
                width:
                  "100%",
              }}
            >
              Official listing unavailable
            </button>
          )}
        </div>
      );
    };

  /* =======================================================
     RETURN
  ======================================================= */

  return (
    <div className="app">

      {/* ===================================================
          NAVBAR
      =================================================== */}

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
            {profileSaved
              ? "My Profile"
              : "Get Started →"}
          </a>

        </div>
      </nav>

      {/* ===================================================
          1. LANDING / HERO FIRST
      =================================================== */}

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
            real public opportunities that
            can match their skills, interests,
            department and career direction.
          </p>

          <div className="hero-buttons">

            <a
              href="#profile"
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
            Real public listings
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

      {/* ===================================================
          FEATURE CARDS
      =================================================== */}

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
            feedback and AI assistance.
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
              available opportunity listings
              to identify relevant options.
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
              Engineering, commerce,
              management, law, design,
              agriculture, arts and other
              fields can use AENOVA.
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
              listings and links users to the
              official listing when available.
            </p>

            <a href="#opportunities">
              Explore listings →
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
              projects, skills, interviews
              and opportunities.
            </p>

            <a href="#assistant">
              Talk to ANEBESTRA →
            </a>

          </div>

        </div>

      </section>

      {/* ===================================================
          2. PROFILE — AFTER LANDING PAGE
      =================================================== */}

      <section
        className="profile-section"
        id="profile"
        style={{
          paddingTop:
            "75px",
        }}
      >

        <div className="section-heading">

          <div className="section-badge">
            ✦ Personalize AENOVA
          </div>

          <h2>
            Build your
            <span>
              {" "}student profile.
            </span>
          </h2>

          <p>
            Complete these 5 simple steps.
            AENOVA will use your information
            to create more relevant
            recommendations.
          </p>

        </div>

        <div
          className="profile-form"
          style={{
            maxWidth:
              "650px",
            margin:
              "0 auto",
          }}
        >

          {/* PROGRESS */}

          <div
            style={{
              marginBottom:
                "25px",
            }}
          >

            <div
              style={{
                display:
                  "flex",
                justifyContent:
                  "space-between",
                marginBottom:
                  "9px",
                fontSize:
                  "11px",
                fontWeight:
                  "800",
                color:
                  "#6257e8",
              }}
            >
              <span>
                Step {profileStep} of 5
              </span>

              <span>
                {profileStep === 1
                  ? "Basic Information"
                  : profileStep === 2
                  ? "Education"
                  : profileStep === 3
                  ? "Location"
                  : profileStep === 4
                  ? "Skills & Interests"
                  : "Career Goal"}
              </span>
            </div>

            <div
              style={{
                height:
                  "7px",
                background:
                  "#eeeeF8",
                borderRadius:
                  "99px",
                overflow:
                  "hidden",
              }}
            >

              <div
                style={{
                  width:
                    `${profileStep * 20}%`,
                  height:
                    "100%",
                  background:
                    "linear-gradient(90deg,#4d6df6,#7655f5)",
                  borderRadius:
                    "99px",
                  transition:
                    "width .3s ease",
                }}
              />

            </div>

          </div>

          {/* STEP CIRCLES */}

          <div
            style={{
              display:
                "flex",
              justifyContent:
                "center",
              gap:
                "8px",
              marginBottom:
                "25px",
            }}
          >

            {[1, 2, 3, 4, 5].map(
              (step) => (
                <div
                  key={step}
                  style={{
                    width:
                      "34px",
                    height:
                      "34px",
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
              )
            )}

          </div>

          {/* ================================================
              STEP 1
          ================================================= */}

          {profileStep === 1 && (
            <div>

              <div
                style={{
                  textAlign:
                    "center",
                  marginBottom:
                    "20px",
                }}
              >

                <h3>
                  👋 Basic information
                </h3>

                <p
                  style={{
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
                autoComplete="name"
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
                autoComplete="email"
              />

              <button
                type="button"
                onClick={
                  goToNextStep
                }
              >
                Continue to Education →
              </button>

            </div>
          )}

          {/* ================================================
              STEP 2
          ================================================= */}

          {profileStep === 2 && (
            <div>

              <div
                style={{
                  textAlign:
                    "center",
                  marginBottom:
                    "20px",
                }}
              >

                <h3>
                  🎓 Education
                </h3>

                <p
                  style={{
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
                placeholder="College / University"
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
                placeholder="Department — CSE, ECE, Mechanical, Commerce, Civil, Law, Design, etc."
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
                placeholder="Study Year — 1st Year, 2nd Year, Final Year, etc."
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
                  onClick={() =>
                    setProfileStep(1)
                  }
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
                    goToNextStep
                  }
                >
                  Continue →
                </button>

              </div>

            </div>
          )}

          {/* ================================================
              STEP 3
          ================================================= */}

          {profileStep === 3 && (
            <div>

              <div
                style={{
                  textAlign:
                    "center",
                  marginBottom:
                    "20px",
                }}
              >

                <h3>
                  📍 Location
                </h3>

                <p
                  style={{
                    color:
                      "#77788c",
                    fontSize:
                      "13px",
                  }}
                >
                  Location is one of the
                  signals AENOVA can use
                  when ranking opportunities.
                </p>

              </div>

              <input
                type="text"
                placeholder="City / Location — e.g. Coimbatore, Chennai"
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
                    "#f4f3ff",
                  border:
                    "1px solid #e1defe",
                  borderRadius:
                    "12px",
                  padding:
                    "13px",
                  marginBottom:
                    "15px",
                  fontSize:
                    "12px",
                  color:
                    "#565772",
                  lineHeight:
                    "1.5",
                }}
              >
                🌎 AENOVA can consider
                opportunities near you while
                still showing relevant
                opportunities from across
                India and eligible remote
                listings.
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
                  onClick={() =>
                    setProfileStep(2)
                  }
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
                    goToNextStep
                  }
                >
                  Continue →
                </button>

              </div>

            </div>
          )}

          {/* ================================================
              STEP 4
          ================================================= */}

          {profileStep === 4 && (
            <div>

              <div
                style={{
                  textAlign:
                    "center",
                  marginBottom:
                    "20px",
                }}
              >

                <h3>
                  🧠 Skills & Interests
                </h3>

                <p
                  style={{
                    color:
                      "#77788c",
                    fontSize:
                      "13px",
                  }}
                >
                  These are important
                  signals for matching.
                </p>

              </div>

              <input
                type="text"
                placeholder="Skills — Python, Java, Excel, AutoCAD, Marketing, etc."
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
                placeholder="Interests — AI, Finance, Robotics, Design, Law, Agriculture, etc."
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
                  onClick={() =>
                    setProfileStep(3)
                  }
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
                    goToNextStep
                  }
                >
                  Continue →
                </button>

              </div>

            </div>
          )}

          {/* ================================================
              STEP 5
          ================================================= */}

          {profileStep === 5 && (
            <div>

              <div
                style={{
                  textAlign:
                    "center",
                  marginBottom:
                    "20px",
                }}
              >

                <h3>
                  🎯 Career Goal
                </h3>

                <p
                  style={{
                    color:
                      "#77788c",
                    fontSize:
                      "13px",
                  }}
                >
                  Tell AENOVA what kind
                  of future you are
                  working towards.
                </p>

              </div>

              <input
                type="text"
                placeholder="Career goal — AI Engineer, Finance Analyst, Lawyer, Designer, etc."
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
                    "linear-gradient(135deg,#f3f1ff,#f2fbff)",
                  border:
                    "1px solid #e2defe",
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
                    "1.6",
                }}
              >
                🎯 AENOVA will use your
                complete profile to generate
                personalized recommendations
                from the current real
                opportunity listings.
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
                  onClick={() =>
                    setProfileStep(4)
                  }
                  disabled={
                    savingProfile
                  }
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
                    ? "Saving & finding matches..."
                    : "Save Profile & Find My Matches →"}
                </button>

              </div>

            </div>
          )}

          {/* PROFILE MESSAGE */}

          {profileMessage && (
            <div
              className="profile-message"
              style={{
                marginTop:
                  "16px",
                lineHeight:
                  "1.5",
              }}
            >
              {profileMessage}
            </div>
          )}

          {profileSaved && (
            <div
              style={{
                marginTop:
                  "15px",
                padding:
                  "12px 14px",
                borderRadius:
                  "11px",
                background:
                  "#eaf8f3",
                color:
                  "#16816f",
                fontSize:
                  "12px",
                lineHeight:
                  "1.5",
              }}
            >
              ✓ Your profile is saved.
              Your information will remain
              filled in when you return.
            </div>
          )}

        </div>

      </section>

      {/* ===================================================
          3. AI RECOMMENDATIONS
      =================================================== */}

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
            Your personalized
            <span>
              {" "}AI matches.
            </span>
          </h2>

          <p>
            AENOVA compares your saved
            profile with the current real
            public opportunity listings and
            explains why a listing may be
            relevant.
          </p>

        </div>

        {!profileSaved && (
          <div
            style={{
              maxWidth:
                "800px",
              margin:
                "0 auto 25px",
              padding:
                "18px",
              borderRadius:
                "15px",
              background:
                "#f2f1ff",
              border:
                "1px solid #ddd9ff",
              textAlign:
                "center",
              color:
                "#514ac2",
            }}
          >

            <strong>
              Complete your profile first.
            </strong>

            <br />

            <span
              style={{
                fontSize:
                  "13px",
              }}
            >
              Your department, skills,
              interests and career goal help
              AENOVA personalize your matches.
            </span>

            <br />

            <button
              type="button"
              onClick={() =>
                scrollToSection(
                  "profile"
                )
              }
              style={{
                marginTop:
                  "12px",
                border:
                  "none",
                borderRadius:
                  "9px",
                padding:
                  "9px 15px",
                background:
                  "#6257e8",
                color:
                  "#fff",
                fontWeight:
                  "700",
                cursor:
                  "pointer",
              }}
            >
              Complete Profile →
            </button>

          </div>
        )}

        {loadingRecommendations && (
          <div className="empty-opportunities">

            <h3>
              ✦ Creating your matches...
            </h3>

            <p>
              AENOVA is analyzing your
              profile against available
              opportunities.
            </p>

          </div>
        )}

        {profileSaved &&
          !loadingRecommendations &&
          topRecommendations.length >
            0 && (
            <div
              style={{
                maxWidth:
                  "900px",
                margin:
                  "0 auto 24px",
                padding:
                  "17px 20px",
                borderRadius:
                  "15px",
                background:
                  "linear-gradient(135deg,#eaf8f3,#f1f0ff)",
                border:
                  "1px solid #dddff4",
                textAlign:
                  "center",
              }}
            >

              <div
                style={{
                  fontSize:
                    "16px",
                  fontWeight:
                    "800",
                  color:
                    "#16866f",
                  marginBottom:
                    "5px",
                }}
              >
                ✓ Your recommendations are ready!
              </div>

              <div
                style={{
                  color:
                    "#66677b",
                  fontSize:
                    "12px",
                }}
              >
                AENOVA found{" "}
                <strong>
                  {
                    topRecommendations.length
                  }
                </strong>{" "}
                potential matches from
                the current listings.
              </div>

            </div>
          )}

        {recommendationMessage &&
          !loadingRecommendations && (
            <div
              style={{
                maxWidth:
                  "800px",
                margin:
                  "0 auto 20px",
                padding:
                  "14px 17px",
                borderRadius:
                  "12px",
                background:
                  "#fff8e9",
                border:
                  "1px solid #f0dfb4",
                color:
                  "#80621c",
                fontSize:
                  "12px",
                lineHeight:
                  "1.5",
                textAlign:
                  "center",
              }}
            >
              {recommendationMessage}
            </div>
          )}

        {!loadingRecommendations &&
          profileSaved &&
          topRecommendations.length >
            0 && (
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
                gap:
                  "18px",
              }}
            >

              {topRecommendations.map(
                (
                  item,
                  index
                ) => (
                  <RecommendationCard
                    key={
                      item.opportunity.id ||
                      item.opportunity.title ||
                      index
                    }
                    item={
                      item
                    }
                  />
                )
              )}

            </div>
          )}

        {!loadingRecommendations &&
          profileSaved &&
          topRecommendations.length ===
            0 && (
            <div
              className="empty-opportunities"
            >

              <h3>
                No strong matches yet
              </h3>

              <p>
                Your profile is saved, but
                there are currently no strong
                matches in the available
                opportunity listings.
              </p>

              <button
                type="button"
                onClick={() =>
                  scrollToSection(
                    "profile"
                  )
                }
                style={{
                  marginTop:
                    "12px",
                  border:
                    "none",
                  borderRadius:
                    "10px",
                  padding:
                    "11px 17px",
                  background:
                    "#6257e8",
                  color:
                    "#fff",
                  fontWeight:
                    "700",
                  cursor:
                    "pointer",
                }}
              >
                Update My Profile →
              </button>

            </div>
          )}

      </section>

      {/* ===================================================
          4. OPPORTUNITIES
      =================================================== */}

      <section
        className="opportunities-section"
        id="opportunities"
      >

        <div className="section-heading">

          <div className="section-badge">
            ✦ Explore opportunities
          </div>

          <h2>
            Browse available
            <span>
              {" "}listings.
            </span>
          </h2>

          <p>
            These are public opportunity
            listings currently collected by
            AENOVA.
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
                listings available for this
                category.
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
                      PUBLIC ·{" "}
                      {opportunity.source ||
                        "LISTING"}
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

                    {opportunity.location && (
                      <span>
                        📍{" "}
                        {
                          opportunity.location
                        }
                      </span>
                    )}

                    {opportunity.organization && (
                      <span>
                        🏢{" "}
                        {
                          opportunity.organization
                        }
                      </span>
                    )}

                    {opportunity.deadline && (
                      <span>
                        📅 Registration:{" "}
                        {
                          opportunity.deadline
                        }
                      </span>
                    )}

                    {opportunity.event_date && (
                      <span>
                        🗓 Event:{" "}
                        {
                          opportunity.event_date
                        }
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

      {/* ===================================================
          5. HOW IT WORKS
      =================================================== */}

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
            AENOVA combines profile
            information, opportunity data
            and feedback to improve discovery.
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
              Build Profile
            </h3>

            <p>
              Add your education, location,
              skills, interests and career
              goal.
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
              AENOVA identifies useful
              signals from your profile.
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
              Relevant real opportunity
              listings are ranked for you.
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
              additional recommendation
              signals.
            </p>

          </div>

        </div>

      </section>

      {/* ===================================================
          6. ANEBESTRA
      =================================================== */}

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
            opportunities, interviews, skills
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
                  className={`chat-message ${
                    message.sender ===
                    "bot"
                      ? "bot-message"
                      : "user-message"
                  }`}
                >

                  {message.isThinking ? (
                    <div>
                      ANEBESTRA is thinking...
                    </div>
                  ) : message.sender ===
                    "bot" ? (
                    <div
                      style={{
                        lineHeight:
                          "1.6",
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

      {/* ===================================================
          FINAL CTA
      =================================================== */}

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
            Build your profile, discover
            relevant opportunities and use
            ANEBESTRA whenever you need
            guidance.
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

      </section>

      {/* ===================================================
          FOOTER
      =================================================== */}

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
