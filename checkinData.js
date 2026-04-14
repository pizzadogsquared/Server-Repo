export default {
    general: [
        {
            id: "q1",
            question: "What was your water intake for today?",
            responses: [
                {value: 1, icon: "bi-droplet", label: "0-2 glasses"},
                {value: 2, icon: "bi-droplet", label: "3-4 glasses"},
                {value: 3, icon: "bi-droplet-half", label: "5-6 glasses"},
                {value: 4, icon: "bi-droplet-fill", label: "7-8 glasses"},
                {value: 5, icon: "bi-water", label: "9+ glasses"}
            ]
        },
        {
            id: "q2",
            question: "How was your meal consistency today?",
            responses: [
                {value: 1, icon: "", label: "Skipped meals"},
                {value: 2, icon: "", label: "Only one meal"},
                {value: 3, icon: "", label: "Two meals"},
                {value: 4, icon: "", label: "Three meals"},
                {value: 5, icon: "", label: "Balanced meals & snacks"}
            ]
        },
        {
            id: "q3",
            question: "How is your energy today?",
            responses: [
                { value: 1, icon:"bi-battery", label: "Exhausted" },
                { value: 2, icon: "bi-battery-low", label: "Sluggish" },
                { value: 3, icon: "bi-battery-half", label: "Steady" },
                { value: 4, icon: "bi-battery-full", label: "Energetic" },
                { value: 5, icon: "", label: "Peak power"}
            ]
        },
        {
            id: "q4",
            question: "How do you feel about the future?",
            responses: [
                { value: 1, icon: "", label: "Very Pessimistic"},
                { value: 2, icon: "", label: "Uncertain"},
                { value: 3, icon: "", label: "Neutral"},
                { value: 4, icon: "", label: "Hopeful"},
                { value: 5, icon: "", label: "Very Optimistic"}
            ]
        },
        {
            id: "q5",
            question: "Do you feel satisfied with your daily life?",
            responses: [
                { value: 1, icon: "", label: "Not at all"},
                { value: 2, icon: "", label: "Rarely"},
                { value: 3, icon: "", label: "Sometimes"},
                { value: 4, icon: "", label: "Mostly"},
                { value: 5, icon: "", label: "Completely"} 
            ]
        },
    ],
    mental: [
        {
            id: "q1",
            question: "How was your ability to focus throughout the day?",
            responses: [
                { value: 1, icon:"", label: "Constant Distraction" },
                { value: 2, icon: "", label: "Low Focus"},
                { value: 3, icon: "", label: "Occasional Drift"},
                { value: 4, icon: "", label: "Mostly Focused" },
                { value: 5, icon: "", label: "Total Flow State"}
            ]
        },
        {
            id: "q2",
            question: "Did you feel a sense of support",
            responses: [
                { value: 1, icon:"", label: "Isolated" },
                { value: 2, icon: "", label: "Misunderstood"},
                { value: 3, icon: "", label: "Somewhat Supported"},
                { value: 4, icon: "", label: "Well Connected" },
                { value: 5, icon: "", label: "Strongly Supported"} 
            ]
        },
        {
            id: "q3",
            question: "What is your perspective of the challenges you're currently facing?",
            responses: [
                { value: 1, icon:"", label: "Feels Alone" },
                { value: 2, icon: "", label: "Struggling"},
                { value: 3, icon: "", label: "Hanging in There"},
                { value: 4, icon: "", label: "Managing Well" },
                { value: 5, icon: "", label: "Empowered"}
            ]
        },
        {
            id: "q4",
            question: "Where do you feel the level of your self-confidence is at?",
            responses: [
                { value: 1, icon:"", label: "Very Low" },
                { value: 2, icon: "", label: "Doubtful"},
                { value: 3, icon: "", label: "Average"},
                { value: 4, icon: "", label: "Healthy Confidence"},
                { value: 5, icon: "", label: "High Confidence"}
            ]
        },
        {
            id: "q5",
            question: "How do you feel about your current emotional balance?",
            responses: [
                { value: 1, icon:"", label: "Overwhelmed" },
                { value: 2, icon: "", label: "Unstable"},
                { value: 3, icon: "", label: "Neutral"},
                { value: 4, icon: "", label: "Balanced" },
                { value: 5, icon: "", label: "Very Peaceful"}
            ]
        }
    ],
    physical: [
        {
            id: "q1",
            question: "Till when do you use electronic devices after midnight?",
            responses: [
                { value: 1, icon:"", label: "3 AM +" },
                { value: 2, icon: "", label: "2 AM"},
                { value: 3, icon: "", label: "1 AM"},
                { value: 4, icon: "", label: "Just after 12 AM" },
                { value: 5, icon: "", label: "No screens"}
            ]
        },
        {
            id: "q2",
            question: "How long did you exercise for today?",
            responses: [
                {value: 1, icon:"bi-person-standing", label: "None", range: ""},
                {value: 2, icon:"bi-person-walking", label: "Light", range: "30 minutes"},
                {value: 3, icon: "", label: "Moderate", range: "1 hour"},
                {value: 4, icon: "bi-person-arms-up", label: "Moderate-Intensity", range: "1-2 hours"},
                {value: 5, icon: "bi-lightning-charge-fill", label: "Heavy", range:"3+ hours"},
            ]
        },
        {
            id: "q3",
            question: "Around how many minutes of sun exposure did you get today?",
            responses: [
                {value: 1, icon: "", label: "Indoors All Day"},
                {value: 2, icon: "", label: "< 5 minutes"},
                {value: 3, icon: "", label: "5 - 10 minutes"},
                {value: 4, icon: "", label: "10 - 20 minutes"},
                {value: 5, icon: "", label: "30+ minutes"}
            ]
        },
        {
            id: "q4",
            question: "Around how many hours of sleep did you get last night?",
            responses: [
                {value: 1, icon: "", label: "< 4 hours"},
                {value: 2, icon: "", label: "5 hours"},
                {value: 3, icon: "", label: "6 hours"},
                {value: 4, icon: "", label: "7 hours"},
                {value: 5, icon: "", label: "8+ hours"}                
            ]
        },
        {
            id: "q5",
            question: "What was your level of caffine consumption today",
            responses: [
                {value: 1, icon:"", label: "3+ drinks"},
                {value: 2, icon: "", label: "2 drinks"},
                {value: 3, icon: "", label: "1 drink"},
                {value: 4, icon: "", label: "A few sips"},
                {value: 5, icon: "", label: "None"}
            ]
        }
    ]
};

