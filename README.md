# Character.AU

[Visit Character.AU](https://jooshiesaur.github.io/Character-AU/)

**Character.AU** is a custom-built, completely free web application designed for crafting unique characters and guiding their stories through manual, user-driven roleplay.

Popular AI chatbot platforms can be frustrating when you are forced to endlessly "reroll" a response just to get the exact dialogue or action you want. Character.AU takes away the RNG by putting you completely in control; since **you type out every message yourself!**

The **AU** in the name stands for **Alternate Universe**, but it also means **And You**. Because the real creativity isn't in the computer; it's in the user.

---

### Features

* **Full Control:** Write both sides of the narrative or script out exact character responses without fighting an AI's random output.
* **Alternate Universe Building:** Perfect for world-building, creative writing, and exploring custom character dynamics.
* **100% Free & Independent:** No subscriptions, no ads, and fully hosted via GitHub Pages.

*Disclaimer: Character.AU was built, designed, and coded with the assistance of Anthropic's Claude.*

# Changelog

## Version 0.2.0

A massive quality-of-life and UI expansion update introducing custom modals, brand new home navigation, and deep customization features for the site.

### New Features & UI Upgrades

* **Custom In-Site Modals:** Replaced browser popups with sleek, custom-built modals for all input UI (native OS-level color and file pickers remain unchanged).
* **Brand New Home Page:** Added a dynamic landing page featuring horizontal-scrolling **Chats** and **Characters** sections, expandable search/filter icons, and quick-access `+` buttons for empty states.
* **Global Wordmark Navigation:** The Character.AU wordmark is now clickable from anywhere on the site to take you back home.
* **Enhanced Chat & Character Management:**
* Added pencil icons for quick character editing and chat renaming across sidebars and home cards.
* Added a delete message button with a session-based "don't ask again" confirmation toggle (resets on page reload).
* Character deletion: deleting a character from the edit modal keeps their past dialogue in existing stories, relabeling them cleanly as "Deleted Character."
* Deleting the active chat automatically returns you to the home page.


* **Improved Chat Creation:** New chat creation now includes a full checklist of existing characters plus an inline shortcut to create brand-new ones.
* **Smart Character Shortcuts:** Clicking a standalone character card creates a new chat with them, while clicking a character already in an active story jumps you straight to their most recent chat.
* **Dynamic Bubble Text Contrast:** Message bubble text color now automatically and dynamically switches between near-black and white based on the bubble's individual background color, ensuring 100% readability paired with stronger drop shadows.
* **UI & Typography Polish:**
* Applied the **'Cause'** font site-wide, including the main wordmark.
* Fixed dark-mode contrast issues on name inputs.
* The image zoom tool now anchors cleanly to the center instead of the top-left corner.
* Edit-message boxes now auto-grow dynamically to fit text instead of using a fixed, cramped frame.


* **About Page:** Added a clean info page noting the current early-access status and a direct link to the GitHub repository.

---

### 🐛 Known Bugs (to be fixed in V0.3)

* **Inline Character Creation Bug:** When creating a new chat, clicking the "create new character" button opens the character creation menu *behind* the chat creation menu. This requires you to finish making the story first and add the character afterward; additionally, the inline creation flow currently fails to properly attach the newly made character to the story. *(Fix coming in V0.3!)*

---
