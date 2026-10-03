import json
import os
from groq import Groq
from pydantic import BaseModel, Field
from app.features.correction.schemas import CorrectionItem, CorrectionResponse




PROMPT = (
            "You are an expert business communication coach and a linguistic assistant. Your task is to analyze the user's email draft and identify phrases that lack confidence, sound overly apologetic, or use unnecessary softeners (e.g., 'sorry to bother you', 'I think', 'just', 'maybe', 'sorry for the delay' when unnecessary)."
            "Analyze the text and return ONLY a valid JSON object matching the structure below. Do not include any markdown formatting, backticks, or conversational filler outside the JSON. "
            'JSON Structure:'
            '{'
            '"corrections": ['
                '{'
                '"original": "exact weak phrase found in the text",'
                '"suggested": "confident and professional replacement",'
                '"reason": "short, encouraging explanation of why this weakens the message"'
                '}'
            ']'
            '}'
            'If a phrase should be completely removed without a replacement (e.g., unnecessary apologies or filler phrases), set the "suggested" field to an empty string ("").'
            'If the text requires no changes, return:'
                '{'
                    '"corrections": []'
                '}'
            
        )
class CorrectionService:

    def __init__(self):
        self.client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
        self.model = "openai/gpt-oss-20b"

    async def correct_text(self, text: str) -> str:
        """Analyzes text for lack of confidence and apologetic tone,

        returning a JSON string with correction suggestions.
        """
        if not text or not text.strip():
            return json.dumps({"corrections": []})

        system_prompt = PROMPT
        try:
            completion = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {
                        "role": "user",
                        "content": f"Analyze this text:\n\n{text}",
                    },
                ],
                response_format={"type": "json_object"},
                temperature=0.1,
                max_tokens=2048,
            )

            response_content = completion.choices[0].message.content
            try:
                parsed_data = json.loads(response_content)

                if "corrections" not in parsed_data:
                    parsed_data = {"corrections": []}
                raw_items = parsed_data.get("corrections", [])

                temp_items = []
                current_search_index = 0

                for item in raw_items:
                    original_text = item.get("original", "")
                    start_idx = text.find(original_text, current_search_index)

                    if start_idx != -1:
                        end_idx = start_idx + len(original_text)
                        current_search_index = (
                            end_idx
                        )
                    else:
                        start_idx = text.find(original_text)
                        end_idx = (
                            start_idx + len(original_text) if start_idx != -1 else 0
                        )
                        if start_idx == -1:
                            start_idx, end_idx = 0, 0

                    temp_items.append(
                        {
                            "original": original_text,
                            "suggested": item.get("suggested", ""),
                            "reason": item.get("reason", ""),
                            "start": start_idx,
                            "end": end_idx,
                        }
                    )

                correction_items = sorted(
                    temp_items, key=lambda x: x["start"] if x["start"] != 0 else float("inf")
                )

                response_obj = CorrectionResponse(corrections=correction_items)
                return response_obj


            except json.JSONDecodeError:
                return {"corrections": []}

        except Exception as e:
            print(f"Error while calling Groq API: {e}")
            return json.dumps({"corrections": [], "error": str(e)})