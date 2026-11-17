"""BS CS 5th semester (G1+G2) students of Govt. Graduate College of Science, Lahore.

(college roll number, university roll number, name), in college roll order. Each student signs in
with <university roll number>@gcslahore.edu.pk. Corrections from the class list: roll 510 is Anusha
Qaiser (university roll 126188); Abu Huraira is spelled Abu Haraira; and the spellings of Qureshi
(518), Muhammad Haseeb (550) and Irum Akhtar (583) are fixed.
"""

STUDENTS = [
    (503, 126143, "Arooj Fatima"),
    (504, 126277, "Salman Ahmed"),
    (505, 126144, "Ayesha Afzal"),
    (506, 126265, "Muhammad Umar"),
    (507, 126145, "S. M. Affan"),
    (508, 126233, "Amna Shahid"),
    (510, 126188, "Anusha Qaiser"),
    (513, 126176, "Abeeha Wajid"),
    (514, 126122, "Malaika Sohail"),
    (517, 126174, "Ayesha Saeed"),
    (518, 126120, "Muhammad Hassan Qureshi"),
    (519, 126173, "Maria Afzal"),
    (520, 126209, "Umer Farooq"),
    (523, 126151, "Amna Kashif"),
    (524, 126222, "Shozad Abbas"),
    (525, 126169, "Shahzaib Butt"),
    (526, 126181, "Junaid Ramzan"),
    (527, 126167, "Ahmad"),
    (529, 126135, "M. Shehran"),
    (530, 126127, "Sadia Habib"),
    (531, 126166, "M. Shahzaib"),
    (532, 126154, "Abdul Wahab"),
    (533, 126248, "Maria Muskan"),
    (534, 126136, "Sehar Javed"),
    (537, 126165, "M. Ahsan"),
    (538, 126213, "Abiha Rukh"),
    (539, 126175, "Rabia Elahi"),
    (540, 126199, "Danish Abbas"),
    (541, 126236, "M. Talha"),
    (543, 126271, "Ayan Waqar"),
    (546, 126196, "Hafiz Muhammad Abdullah"),
    (547, 126235, "Nimra Tanveer"),
    (549, 126205, "Ahsan Ali"),
    (550, 126139, "Muhammad Haseeb"),
    (552, 126219, "Talha Khan"),
    (553, 126204, "Areeba Mubashir"),
    (554, 126217, "Zainab Shahzad"),
    (558, 126149, "Ali Haider"),
    (559, 126288, "Sadia Anwar"),
    (560, 126264, "Muhammad Wahaj"),
    (561, 126203, "M. Touseef Ahmad"),
    (562, 126250, "Hassan Ali"),
    (565, 126221, "M. Ashfaq Niaz"),
    (567, 126117, "Taha Amir"),
    (569, 126220, "Abdullah Faryad"),
    (571, 126178, "Rubab Majeed"),
    (573, 126244, "Asadullah"),
    (574, 126239, "Ali Hassan"),
    (575, 126211, "Hasaan Ahmad"),
    (576, 126189, "Abu Haraira"),
    (577, 126274, "Umer Nazar"),
    (578, 126262, "Noor ul Huda"),
    (579, 126275, "M. Ikram"),
    (580, 126115, "Rohma Ali Naqvi"),
    (581, 126276, "Yasir Raza"),
    (583, 126179, "Irum Akhtar"),
    (584, 126156, "Muhammad Faheem"),
    (585, 126269, "M. Khazaima"),
    (587, 126249, "Sara Ali"),
    (588, 126270, "Ayesha Amir"),
    (590, 126261, "Khadija Yousaf"),
    (591, 126251, "Ayesha Sabir"),
    (593, 126267, "CH. Ahsan"),
    (595, 126177, "M. Hussain"),
    (596, 126246, "Ali Hamza"),
    (597, 126180, "Faiza"),
]

STUDENT_EMAIL_DOMAIN = "gcslahore.edu.pk"


def split_name(name):
    """'Hafiz Muhammad Abdullah' -> ('Hafiz Muhammad', 'Abdullah'); a single name has no surname."""
    *first, last = name.split()
    return (" ".join(first), last) if first else (last, "")
