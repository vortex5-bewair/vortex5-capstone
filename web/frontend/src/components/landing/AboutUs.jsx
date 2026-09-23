import teamMaverick from '../../assets/Ramos_Maverick.png'
import teamAngelo from '../../assets/Roque_Angelo.png'
import teamJustine from '../../assets/Sanchez_Justine.png'
import teamFernando from '../../assets/Fernando_Sanmocte.png'
import teamRegalado from '../../assets/Santos_Regalado.png'
import teamJomarie from '../../assets/Abenes_Jomarie.png'

const TEAM = [
  { name: 'Maverick Adam Ramos', role: 'Web Developer', photo: teamMaverick },
  { name: 'Christopher Angelo Roque', role: 'Backend Developer', photo: teamAngelo },
  { name: 'Justine Jade Sanchez', role: 'Documentor', photo: teamJustine },
  { name: 'Fernando Sanmocte', role: 'Project Manager', photo: teamFernando },
  { name: 'Regalado Santos Jr.', role: 'Mobile Developer', photo: teamRegalado },
  { name: 'Jomarie Abenes', role: 'UI/UX Designer', photo: teamJomarie },
]

const AboutUs = () => (
  <>
    <div className="landing-about-intro">
      <div>
        <p className="landing-eyebrow-blue">About us</p>
        <h2 className="landing-section-title">
          Built by people<br />who <em>care</em>
        </h2>
      </div>
      <p className="landing-body-text">
        BewAir is a capstone project built by Vortex 5, a team of students who believe
        every classroom deserves air quality you can actually see, not just guess at.
      </p>
    </div>

    <div className="landing-team-grid">
      {TEAM.map((m) => (
        <div key={m.name} className="landing-team-card">
          <img className="landing-team-avatar" src={m.photo} alt={m.name} width={64} height={64} />
          <div>
            <h3 className="landing-team-name">{m.name}</h3>
            <p className="landing-team-role">{m.role}</p>
          </div>
        </div>
      ))}
    </div>
  </>
)

export default AboutUs
