/**
 * Tools → Names Database: given names by origin and gender, for naming characters.
 * Compiled for Olukotan; names only (no meanings), so nothing is guessed.
 */
export type NameGender = "female" | "male" | "unisex";
export interface NameEntry { name: string; gender: NameGender; origin: string }

const DATA: Record<string, Partial<Record<NameGender, string>>> = {
  Yoruba: {
    female: "Adebimpe Adenike Adeola Adesuwa Adetola Adunni Ayomide Ayotunde Bimpe Bolanle Bukola Damilola Folake Folasade Funke Funmilayo Ibukun Ifeoluwa Iyabo Jumoke Kemi Kehinde Lola Modupe Moradeke Morenike Ngozi Omolara Omotola Oyinkansola Remilekun Ronke Sade Shade Simisola Taiwo Titilayo Tolani Tolu Tomi Tope Toyin Wuraola Yejide Yetunde Abike Abiodun Dupe Eniola Iyanu Mojisola Oluwaseun Temitope",
    male: "Ade Adebayo Adekunle Ademola Adewale Akin Akinwale Ayodele Babajide Babatunde Bamidele Bayo Dapo Dayo Femi Gbenga Jide Kayode Kunle Lekan Olamide Olu Oludare Olumide Olusegun Oluwafemi Rotimi Segun Seun Sola Tayo Tunde Wale Yemi Ayinde Deji Kola Lanre Niyi Remi Tobi Wole",
    unisex: "Ayo Dami Fola Ife Kemi Ola Tobi Tolu Tomi Yinka Kehinde Taiwo Abiodun",
  },
  Igbo: {
    female: "Adaeze Adaku Adanna Amaka Amarachi Chiamaka Chidinma Chinwe Chioma Ebere Ezinne Ifeoma Ijeoma Nkechi Nneka Nnenna Obiageli Ogechi Uche Uchenna Ugochi Ujunwa Adaobi Chinyere Kosisochukwu Nkiru Onyinye",
    male: "Chidi Chijioke Chinedu Chukwudi Chukwuemeka Ebuka Emeka Ifeanyi Ikenna Kelechi Nnamdi Obinna Okechukwu Onyeka Tochukwu Uchechukwu Ugochukwu Obi Kene Somto Chibuike Arinze Chidubem",
    unisex: "Chiamaka Chidera Chinonso Chisom Ebube Kamsi Ugonna Uchenna Adaeze",
  },
  Hausa: {
    female: "Aisha Amina Fatima Hadiza Halima Hauwa Jamila Khadija Maryam Rabi Safiya Zainab Zara Asabe Ladi Talatu Binta",
    male: "Abdullahi Abubakar Aliyu Bello Garba Ibrahim Idris Kabiru Lawal Musa Mustapha Sani Shehu Suleiman Umar Usman Yakubu Yusuf Danjuma Haruna",
  },
  "Edo / Urhobo / Ijaw": {
    female: "Efe Eseosa Itohan Osas Ofure Ewaen Ivie Oghenekaro Tamara Ebiere Preye",
    male: "Ehis Osaro Osagie Eghosa Oghenekaro Ovie Tari Ebi Timipre",
    unisex: "Efe Osas Tari",
  },
  Akan: {
    female: "Abena Adwoa Afia Akosua Akua Ama Esi Efua Yaa Adjoa",
    male: "Kofi Kwabena Kwadwo Kwaku Kwame Kwasi Kojo Yaw Kweku Kobina",
  },
  Swahili: {
    female: "Amani Imani Neema Rehema Zawadi Zuri Nia Ashanti Pendo Furaha",
    male: "Baraka Jabari Juma Kito Faraji Hamisi Jelani Rashidi Zuberi",
    unisex: "Amani Imani Baraka",
  },
  English: {
    female: "Alice Amelia Charlotte Chloe Daisy Eleanor Ella Emily Florence Grace Hannah Harriet Isabel Jessica Lily Lucy Matilda Olivia Poppy Rose Sophie Victoria Evie Abigail Beatrice Clara",
    male: "Alfie Arthur Benjamin Charles Daniel Edward George Harry Henry Jack James Joshua Leo Oliver Oscar Samuel Thomas William Archie Freddie Theo Tobias",
    unisex: "Alex Charlie Frankie Jamie Jordan Morgan Riley Sam Taylor Robin",
  },
  "Scottish / Irish / Welsh": {
    female: "Aoife Ciara Eilidh Fiona Isla Mairead Niamh Orla Saoirse Siobhan Sian Cerys Bethan Ffion",
    male: "Alasdair Callum Cian Conor Declan Eoin Fergus Finlay Lachlan Liam Niall Oisin Rhys Dylan Gethin Owain",
  },
  "Caribbean / Diaspora": {
    female: "Aaliyah Keisha Shanice Tanisha Jada Imani Kiara Monique Simone Danielle Shantel",
    male: "Andre Darnell Delroy Jamal Leroy Marlon Tyrone Winston Dwayne Kareem Marcus",
  },
  Arabic: {
    female: "Amira Layla Leila Mariam Noor Rania Salma Yasmin Zahra Lina Huda",
    male: "Ahmed Ali Hassan Hussein Karim Khalid Omar Rami Samir Tariq Yasin Zayd",
  },
  "Spanish / Portuguese": {
    female: "Ana Carmen Elena Isabela Lucia Maria Paula Sofia Valentina Ines Beatriz",
    male: "Alejandro Carlos Diego Javier Joao Luis Mateo Miguel Pablo Rafael Tiago",
  },
  French: {
    female: "Amelie Brigitte Camille Chloe Elise Juliette Margaux Manon Sylvie Celine",
    male: "Antoine Etienne Hugo Jean Julien Laurent Louis Mathieu Pierre Remy",
  },
  Italian: { female: "Alessia Bianca Chiara Francesca Giulia Lucia Sofia Valentina", male: "Alessandro Francesco Giovanni Lorenzo Luca Marco Matteo Paolo" },
  "South Asian": {
    female: "Aditi Ananya Divya Kavya Meera Neha Priya Riya Sana Zara Anjali",
    male: "Aarav Arjun Dev Ishaan Karan Nikhil Rahul Ravi Rohan Sanjay Vikram",
  },
  "East Asian": {
    female: "Mei Lin Xiu Yuki Sakura Hana Aiko Ji-woo Seo-yeon Min-ji",
    male: "Wei Jun Hao Hiroshi Kenji Takeshi Min-jun Seo-jun Ji-ho",
  },
};

export const NAMES: NameEntry[] = Object.entries(DATA).flatMap(([origin, byGender]) =>
  (Object.entries(byGender) as [NameGender, string][]).flatMap(([gender, names]) => names.split(/\s+/u).filter(Boolean).map((name) => ({ name, gender, origin }))));

export const NAME_ORIGINS = Object.keys(DATA);

export function searchNames(query: string, origin?: string, gender?: NameGender): NameEntry[] {
  const q = query.trim().toLocaleLowerCase("en-GB");
  return NAMES.filter((entry) => (!origin || entry.origin === origin) && (!gender || entry.gender === gender || entry.gender === "unisex") && (!q || entry.name.toLocaleLowerCase("en-GB").startsWith(q)))
    .sort((a, b) => a.name.localeCompare(b.name));
}
